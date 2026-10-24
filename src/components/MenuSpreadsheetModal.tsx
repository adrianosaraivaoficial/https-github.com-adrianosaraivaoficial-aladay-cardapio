import React, { useState, useRef, useEffect } from 'react';
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  X,
  FileDown,
  Table,
  Sparkles,
  RefreshCw,
  FolderPlus,
  PackagePlus,
  ClipboardPaste,
  HelpCircle,
} from 'lucide-react';
import { Category, OptionGroup, Product, RestaurantTenant } from '../types';

interface MenuSpreadsheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: RestaurantTenant;
  categories: Category[];
  products: Product[];
  onImportCatalog: (newCategories: Category[], newProducts: Product[], mode: 'merge' | 'replace') => void;
  initialTab?: 'export' | 'import';
}

export interface ParsedRowPreview {
  rowNumber: number;
  categoryOrder: number;
  categoryName: string;
  productName: string;
  description: string;
  priceCents: number;
  isAvailable: boolean;
  isFeatured: boolean;
  imageUrl: string;
  optionGroups: OptionGroup[];
  status: 'valid' | 'category_only' | 'error';
  errorMessage?: string;
}

// Serialize OptionGroups into a clean human-editable cell format:
// "Ponto da Carne (Obrigatorio,1,1): Ao Ponto=0,00 | Bem Passado=0,00 || Turbine seu Burger (Opcional,0,3): Bacon Extra=6,00 | Cheddar=5,00"
export function serializeOptionGroupsToCell(groups?: OptionGroup[]): string {
  if (!groups || groups.length === 0) return '';
  return groups
    .map((g) => {
      const reqFlag = g.required ? 'Obrigatorio' : 'Opcional';
      const header = `${g.name} (${reqFlag},${g.minSelections ?? 0},${g.maxSelections ?? 1})`;
      const itemsStr = (g.items || [])
        .map((it) => {
          const priceStr = (it.priceCents / 100).toFixed(2).replace('.', ',');
          return `${it.name}=${priceStr}`;
        })
        .join(' | ');
      return `${header}: ${itemsStr}`;
    })
    .join(' || ');
}

// Parse OptionGroups cell back into structured OptionGroup[]
export function parseOptionGroupsFromCell(raw: string): OptionGroup[] {
  if (!raw || !raw.trim()) return [];
  const groupsRaw = raw
    .split('||')
    .map((s) => s.trim())
    .filter(Boolean);

  return groupsRaw.map((groupSegment, gIdx) => {
    const colonIdx = groupSegment.indexOf(':');
    const headerPart = colonIdx >= 0 ? groupSegment.slice(0, colonIdx).trim() : groupSegment.trim();
    const itemsPart = colonIdx >= 0 ? groupSegment.slice(colonIdx + 1).trim() : '';

    let groupName = headerPart;
    let required = false;
    let minSelections = 0;
    let maxSelections = 1;

    const metaMatch = headerPart.match(/^(.*?)\(([^)]+)\)\s*$/);
    if (metaMatch) {
      groupName = metaMatch[1].trim() || `Grupo ${gIdx + 1}`;
      const metaParts = metaMatch[2].split(',').map((p) => p.trim());
      if (metaParts[0]) {
        const norm = metaParts[0].toLowerCase();
        required = norm.startsWith('obrig') || norm === 'sim' || norm === 'true' || norm === '1';
      }
      if (metaParts[1] !== undefined && !isNaN(Number(metaParts[1]))) {
        minSelections = Math.max(0, parseInt(metaParts[1], 10));
      } else {
        minSelections = required ? 1 : 0;
      }
      if (metaParts[2] !== undefined && !isNaN(Number(metaParts[2]))) {
        maxSelections = Math.max(1, parseInt(metaParts[2], 10));
      }
    }

    const items = itemsPart
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((itemStr, iIdx) => {
        const eqIdx = itemStr.lastIndexOf('=');
        const name = eqIdx >= 0 ? itemStr.slice(0, eqIdx).trim() : itemStr.trim();
        const priceRaw = eqIdx >= 0 ? itemStr.slice(eqIdx + 1).trim() : '0';
        const priceCents = parsePriceBRLToCents(priceRaw);
        return {
          id: `opt_item_${Date.now()}_${gIdx}_${iIdx}`,
          name: name || `Opção ${iIdx + 1}`,
          priceCents,
        };
      });

    return {
      id: `opt_grp_${Date.now()}_${gIdx}`,
      name: groupName,
      required,
      minSelections,
      maxSelections,
      items,
    };
  });
}

export function parsePriceBRLToCents(raw: string): number {
  if (!raw) return 0;
  const cleaned = String(raw)
    .replace(/[R$\s]/gi, '')
    .trim();
  if (!cleaned) return 0;

  // Handle Brazilian format "1.234,56" or "34,90" vs "34.90"
  let normalized = cleaned;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    normalized = cleaned.replace(',', '.');
  }
  const num = parseFloat(normalized);
  if (isNaN(num) || num < 0) return 0;
  return Math.round(num * 100);
}

// Escape CSV field cleanly
export function escapeCsvCell(value: string | number | boolean | undefined | null, delimiter: ';' | ','): string {
  const str = value === undefined || value === null ? '' : String(value);
  if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Parse CSV / TSV text supporting quoted fields with newlines or delimiters
export function parseSpreadsheetLines(rawText: string): string[][] {
  const text = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const firstNonEmptyLine = text.split('\n').find((l) => l.trim().length > 0) || '';

  // Detect delimiter automatically: Tab (\t) from Excel copy-paste, Semicolon (;), or Comma (,)
  let delimiter = ';';
  const tabCount = (firstNonEmptyLine.match(/\t/g) || []).length;
  const semiCount = (firstNonEmptyLine.match(/;/g) || []).length;
  const commaCount = (firstNonEmptyLine.match(/,/g) || []).length;

  if (tabCount >= semiCount && tabCount >= commaCount && tabCount > 0) {
    delimiter = '\t';
  } else if (semiCount >= commaCount && semiCount > 0) {
    delimiter = ';';
  } else if (commaCount > 0) {
    delimiter = ',';
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const nextCh = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && nextCh === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (ch === '\n') {
        currentRow.push(currentCell.trim());
        if (currentRow.some((cell) => cell !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += ch;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export const MenuSpreadsheetModal: React.FC<MenuSpreadsheetModalProps> = ({
  isOpen,
  onClose,
  tenant,
  categories,
  products,
  onImportCatalog,
  initialTab = 'export',
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>(initialTab);
  const [csvDelimiter, setCsvDelimiter] = useState<';' | ','>(';');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [rawInputText, setRawInputText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRowPreview[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const formatBRL = (cents: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

  // 1. Export Full Catalog (Categories + Products)
  const handleExportFullCatalog = () => {
    const headers = [
      'Ordem_Categoria',
      'Categoria',
      'Nome_Produto',
      'Descricao',
      'Preco_BRL',
      'Disponivel',
      'Destaque',
      'Imagem_URL',
      'Adicionais',
    ];

    const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
    const dataRows: string[][] = [];

    sortedCategories.forEach((cat, idx) => {
      const catProducts = products.filter((p) => p.categoryId === cat.id);
      const orderNum = cat.order || idx + 1;

      if (catProducts.length === 0) {
        // Export category row even if it currently has no products
        dataRows.push([String(orderNum), cat.name, '', '', '', 'SIM', 'NAO', '', '']);
      } else {
        catProducts.forEach((prod) => {
          const priceFormatted = (prod.priceCents / 100).toFixed(2).replace('.', ',');
          dataRows.push([
            String(orderNum),
            cat.name,
            prod.name,
            prod.description || '',
            priceFormatted,
            prod.isAvailable ? 'SIM' : 'NAO',
            prod.isFeatured ? 'SIM' : 'NAO',
            prod.imageUrl || '',
            serializeOptionGroupsToCell(prod.optionGroups),
          ]);
        });
      }
    });

    // Also include any orphan products whose categoryId wasn't in categories
    const knownCatIds = new Set(categories.map((c) => c.id));
    const orphanProducts = products.filter((p) => !knownCatIds.has(p.categoryId));
    orphanProducts.forEach((prod) => {
      const priceFormatted = (prod.priceCents / 100).toFixed(2).replace('.', ',');
      dataRows.push([
        String(sortedCategories.length + 1),
        'Geral',
        prod.name,
        prod.description || '',
        priceFormatted,
        prod.isAvailable ? 'SIM' : 'NAO',
        prod.isFeatured ? 'SIM' : 'NAO',
        prod.imageUrl || '',
        serializeOptionGroupsToCell(prod.optionGroups),
      ]);
    });

    const csvContent =
      '\uFEFF' +
      [headers, ...dataRows]
        .map((row) => row.map((cell) => escapeCsvCell(cell, csvDelimiter)).join(csvDelimiter))
        .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute('download', `cardapio-${tenant.slug}-${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setFeedbackBanner({
      type: 'success',
      message: `Planilha completa do cardápio de "${tenant.name}" (${categories.length} categorias e ${products.length} produtos) exportada com sucesso!`,
    });
  };

  // 2. Export Only Categories
  const handleExportCategoriesOnly = () => {
    const headers = ['Ordem_Categoria', 'Categoria', 'Qtd_Produtos_Atuais'];
    const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

    const dataRows = sortedCategories.map((cat, idx) => [
      String(cat.order || idx + 1),
      cat.name,
      String(products.filter((p) => p.categoryId === cat.id).length),
    ]);

    const csvContent =
      '\uFEFF' +
      [headers, ...dataRows]
        .map((row) => row.map((cell) => escapeCsvCell(cell, csvDelimiter)).join(csvDelimiter))
        .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `categorias-${tenant.slug}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setFeedbackBanner({
      type: 'success',
      message: `Planilha de categorias de "${tenant.name}" (${categories.length} categorias) exportada com sucesso!`,
    });
  };

  // 3. Download Blank/Example Template for Mounting Menu
  const getTemplateRows = (): string[][] => [
    [
      '1',
      'Lanches & Burgers',
      'Smash Duplo Especial',
      'Dois blends bovinos de 90g, queijo cheddar derretido, bacon crocante e molho da casa no pão brioche.',
      '34,90',
      'SIM',
      'SIM',
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600',
      'Ponto da Carne (Obrigatorio,1,1): Ao Ponto=0,00 | Bem Passado=0,00 || Adicionais (Opcional,0,3): Bacon Extra=6,00 | Cheddar Extra=5,00',
    ],
    [
      '1',
      'Lanches & Burgers',
      'Classic Salad Burger',
      'Blend bovino 160g, queijo prato, alface americana, tomate italiano, cebola roxa e maionese verde.',
      '29,90',
      'SIM',
      'NAO',
      'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600',
      'Ponto da Carne (Obrigatorio,1,1): Ao Ponto=0,00 | Bem Passado=0,00',
    ],
    [
      '2',
      'Porções & Acompanhamentos',
      'Batata Frita Rústica com Cheddar e Bacon',
      'Porção generosa de 350g de batatas crocantes com cobertura de molho cheddar cremoso e farofa de bacon.',
      '26,90',
      'SIM',
      'SIM',
      'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600',
      '',
    ],
    [
      '3',
      'Bebidas Geladas',
      'Refrigerante Lata 350ml',
      'Coca-Cola Original, Coca-Cola Zero ou Guaraná Antarctica lata 350ml trincando de gelada.',
      '7,50',
      'SIM',
      'NAO',
      'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600',
      'Escolha o Sabor (Obrigatorio,1,1): Coca-Cola Original=0,00 | Coca-Cola Zero=0,00 | Guaraná Antarctica=0,00',
    ],
    [
      '4',
      'Sobremesas',
      'Brownie Artesanal com Sorvete',
      'Brownie de chocolate meio amargo aquecido com bola de sorvete de creme e calda de chocolate.',
      '22,00',
      'SIM',
      'NAO',
      'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600',
      '',
    ],
  ];

  const handleDownloadTemplate = () => {
    const headers = [
      'Ordem_Categoria',
      'Categoria',
      'Nome_Produto',
      'Descricao',
      'Preco_BRL',
      'Disponivel',
      'Destaque',
      'Imagem_URL',
      'Adicionais',
    ];

    const templateRows = getTemplateRows();
    const csvContent =
      '\uFEFF' +
      [headers, ...templateRows]
        .map((row) => row.map((cell) => escapeCsvCell(cell, csvDelimiter)).join(csvDelimiter))
        .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `planilha-modelo-cardapio-${tenant.slug}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setFeedbackBanner({
      type: 'success',
      message: 'Planilha Modelo baixada! Preencha no Excel ou Google Planilhas e envie na aba "Importar Planilha".',
    });
  };

  // Parse raw CSV/TSV text into preview rows
  const processSpreadsheetText = (text: string, sourceLabel?: string) => {
    setRawInputText(text);
    if (sourceLabel) setUploadedFileName(sourceLabel);
    setFeedbackBanner(null);

    if (!text.trim()) {
      setParsedRows([]);
      return;
    }

    const rawRows = parseSpreadsheetLines(text);
    if (rawRows.length === 0) {
      setParsedRows([]);
      return;
    }

    // Check if first row is a header row
    const firstRowLower = rawRows[0].map((c) =>
      c
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
    );

    const hasHeader =
      firstRowLower.some((col) => col.includes('categoria') || col.includes('category')) ||
      firstRowLower.some((col) => col.includes('produto') || col.includes('nome') || col.includes('preco'));

    // Map column indices flexibly by header name or default positional order
    let idxOrder = 0;
    let idxCategory = 1;
    let idxProductName = 2;
    let idxDescription = 3;
    let idxPrice = 4;
    let idxAvailable = 5;
    let idxFeatured = 6;
    let idxImage = 7;
    let idxOptions = 8;

    if (hasHeader) {
      const findCol = (keywords: string[], fallback: number) => {
        const found = firstRowLower.findIndex((h) => keywords.some((kw) => h.includes(kw)));
        return found >= 0 ? found : fallback;
      };

      // Check if it's a 2-column or 3-column categories-only sheet
      const hasProductCol = firstRowLower.some(
        (h) => h.includes('nome_produto') || h === 'produto' || h === 'prato' || h === 'item'
      );

      idxOrder = findCol(['ordem', 'order', 'posicao'], 0);
      idxCategory = findCol(['categoria', 'category', 'secao'], firstRowLower.length === 1 ? 0 : 1);

      if (!hasProductCol && firstRowLower.length <= 3) {
        idxProductName = -1;
        idxDescription = -1;
        idxPrice = -1;
        idxAvailable = -1;
        idxFeatured = -1;
        idxImage = -1;
        idxOptions = -1;
      } else {
        idxProductName = findCol(['nome_produto', 'produto', 'prato', 'nome', 'item'], 2);
        idxDescription = findCol(['descricao', 'description', 'ingredientes', 'detalhe'], 3);
        idxPrice = findCol(['preco', 'valor', 'price'], 4);
        idxAvailable = findCol(['disponivel', 'ativo', 'status', 'available'], 5);
        idxFeatured = findCol(['destaque', 'featured', 'promocao'], 6);
        idxImage = findCol(['imagem', 'foto', 'image', 'url'], 7);
        idxOptions = findCol(['adicionais', 'opcoes', 'complementos', 'options'], 8);
      }
    }

    const dataRows = hasHeader ? rawRows.slice(1) : rawRows;
    const previews: ParsedRowPreview[] = [];

    dataRows.forEach((cols, idx) => {
      const rowNumber = hasHeader ? idx + 2 : idx + 1;
      const getCol = (cIdx: number) => (cIdx >= 0 && cIdx < cols.length ? cols[cIdx]?.trim() || '' : '');

      const orderRaw = getCol(idxOrder);
      const categoryName = getCol(idxCategory);
      const productName = getCol(idxProductName);
      const description = getCol(idxDescription);
      const priceRaw = getCol(idxPrice);
      const availableRaw = getCol(idxAvailable).toUpperCase();
      const featuredRaw = getCol(idxFeatured).toUpperCase();
      const imageUrl = getCol(idxImage);
      const optionsRaw = getCol(idxOptions);

      const categoryOrder = !isNaN(Number(orderRaw)) && Number(orderRaw) > 0 ? parseInt(orderRaw, 10) : idx + 1;

      if (!categoryName && !productName) {
        return;
      }

      if (!categoryName) {
        previews.push({
          rowNumber,
          categoryOrder,
          categoryName: 'Sem Categoria',
          productName: productName || '(Sem nome)',
          description,
          priceCents: 0,
          isAvailable: true,
          isFeatured: false,
          imageUrl,
          optionGroups: [],
          status: 'error',
          errorMessage: 'Coluna "Categoria" está vazia nesta linha.',
        });
        return;
      }

      // Category-only row (when restaurant creates empty categories or exports categories sheet)
      if (!productName) {
        previews.push({
          rowNumber,
          categoryOrder,
          categoryName,
          productName: '',
          description: '',
          priceCents: 0,
          isAvailable: true,
          isFeatured: false,
          imageUrl: '',
          optionGroups: [],
          status: 'category_only',
        });
        return;
      }

      const priceCents = parsePriceBRLToCents(priceRaw);
      if (priceCents <= 0) {
        previews.push({
          rowNumber,
          categoryOrder,
          categoryName,
          productName,
          description,
          priceCents: 0,
          isAvailable: true,
          isFeatured: false,
          imageUrl,
          optionGroups: [],
          status: 'error',
          errorMessage: `Preço inválido ou zerado ("${priceRaw || 'vazio'}"). Exemplo válido: 34,90`,
        });
        return;
      }

      const isAvailable =
        availableRaw === '' ||
        availableRaw === 'SIM' ||
        availableRaw === 'S' ||
        availableRaw === 'TRUE' ||
        availableRaw === '1' ||
        availableRaw === 'ATIVO' ||
        availableRaw === 'DISPONIVEL';

      const isFeatured =
        featuredRaw === 'SIM' ||
        featuredRaw === 'S' ||
        featuredRaw === 'TRUE' ||
        featuredRaw === '1' ||
        featuredRaw === 'DESTAQUE';

      const optionGroups = parseOptionGroupsFromCell(optionsRaw);

      previews.push({
        rowNumber,
        categoryOrder,
        categoryName,
        productName,
        description,
        priceCents,
        isAvailable,
        isFeatured,
        imageUrl,
        optionGroups,
        status: 'valid',
      });
    });

    setParsedRows(previews);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      processSpreadsheetText(content, file.name);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleLoadSampleIntoPreview = () => {
    const headers = [
      'Ordem_Categoria',
      'Categoria',
      'Nome_Produto',
      'Descricao',
      'Preco_BRL',
      'Disponivel',
      'Destaque',
      'Imagem_URL',
      'Adicionais',
    ];
    const rows = getTemplateRows();
    const sampleText = [headers, ...rows]
      .map((r) => r.map((c) => escapeCsvCell(c, ';')).join(';'))
      .join('\n');
    processSpreadsheetText(sampleText, 'planilha-exemplo-cardapio.csv');
  };

  const validRows = parsedRows.filter((r) => r.status === 'valid' || r.status === 'category_only');
  const validProductRows = parsedRows.filter((r) => r.status === 'valid');
  const errorRows = parsedRows.filter((r) => r.status === 'error');
  const distinctCategoryNames = Array.from(
    new Set(validRows.map((r) => r.categoryName.trim()))
  );

  const handleConfirmImport = () => {
    if (validRows.length === 0) return;

    const normalizeName = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    const baseCategories: Category[] = importMode === 'replace' ? [] : [...categories];
    const baseProducts: Product[] = importMode === 'replace' ? [] : [...products];

    const categoryMapByNormName = new Map<string, Category>();
    baseCategories.forEach((cat) => {
      categoryMapByNormName.set(normalizeName(cat.name), cat);
    });

    // 1. Ensure all categories from spreadsheet exist
    validRows.forEach((row) => {
      const normCat = normalizeName(row.categoryName);
      if (!categoryMapByNormName.has(normCat)) {
        const newCat: Category = {
          id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: row.categoryName.trim(),
          order: row.categoryOrder || categoryMapByNormName.size + 1,
        };
        categoryMapByNormName.set(normCat, newCat);
        baseCategories.push(newCat);
      } else {
        const existingCat = categoryMapByNormName.get(normCat)!;
        if (row.categoryOrder && importMode === 'replace') {
          existingCat.order = row.categoryOrder;
        }
      }
    });

    // Sort categories by order
    const finalCategories = [...baseCategories].sort((a, b) => a.order - b.order);

    // 2. Process all product rows
    const finalProducts = [...baseProducts];

    validProductRows.forEach((row, idx) => {
      const normCat = normalizeName(row.categoryName);
      const targetCat = categoryMapByNormName.get(normCat)!;
      const normProd = normalizeName(row.productName);

      const existingProdIndex = finalProducts.findIndex(
        (p) => p.categoryId === targetCat.id && normalizeName(p.name) === normProd
      );

      if (existingProdIndex >= 0) {
        // Update existing product
        finalProducts[existingProdIndex] = {
          ...finalProducts[existingProdIndex],
          name: row.productName.trim(),
          description: row.description.trim(),
          priceCents: row.priceCents,
          isAvailable: row.isAvailable,
          isFeatured: row.isFeatured,
          imageUrl: row.imageUrl || finalProducts[existingProdIndex].imageUrl,
          optionGroups:
            row.optionGroups.length > 0
              ? row.optionGroups
              : finalProducts[existingProdIndex].optionGroups,
        };
      } else {
        // Create new product
        finalProducts.push({
          id: `prod_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          categoryId: targetCat.id,
          name: row.productName.trim(),
          description: row.description.trim(),
          priceCents: row.priceCents,
          isAvailable: row.isAvailable,
          isFeatured: row.isFeatured,
          imageUrl: row.imageUrl || undefined,
          optionGroups: row.optionGroups.length > 0 ? row.optionGroups : undefined,
        });
      }
    });

    onImportCatalog(finalCategories, finalProducts, importMode);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-neutral-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold">
                  Planilha de Cardápio (Categorias &amp; Produtos)
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-neutral-800 text-emerald-400 rounded border border-neutral-700">
                  {tenant.name}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Exporte suas categorias e produtos para Excel/Google Sheets ou importe uma planilha para montar o cardápio em segundos.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 pt-3 bg-neutral-50 border-b border-neutral-200 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('export');
              setFeedbackBanner(null);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'export'
                ? 'border-neutral-900 text-neutral-900 bg-white rounded-t-lg'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>1. Exportar Cardápio / Baixar Modelo (.CSV / Excel)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('import');
              setFeedbackBanner(null);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'import'
                ? 'border-neutral-900 text-neutral-900 bg-white rounded-t-lg'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>2. Importar Planilha para Montar Cardápio</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {feedbackBanner && (
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
                feedbackBanner.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {feedbackBanner.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span className="font-medium">{feedbackBanner.message}</span>
              </div>
              <button
                onClick={() => setFeedbackBanner(null)}
                className="text-neutral-400 hover:text-neutral-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 1: EXPORTAR CARDÁPIO & PLANILHA MODELO                     */}
          {/* ============================================================== */}
          {activeTab === 'export' && (
            <div className="space-y-5">
              {/* Delimiter Selector */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-neutral-900">
                    Formato de Compatibilidade da Planilha
                  </h4>
                  <p className="text-[11px] text-neutral-600 mt-0.5">
                    Arquivos gerados com codificação <strong>UTF-8 com BOM</strong> para preservar acentos (ç, ã, é) no Microsoft Excel e Google Planilhas.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <label className="text-xs font-semibold text-neutral-700">Separador:</label>
                  <select
                    value={csvDelimiter}
                    onChange={(e) => setCsvDelimiter(e.target.value as ';' | ',')}
                    className="bg-white border border-neutral-300 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-900"
                  >
                    <option value=";">Ponto e Vírgula (;) — Padrão Excel Brasil</option>
                    <option value=",">Vírgula (,) — Padrão Google Sheets / CSV</option>
                  </select>
                </div>
              </div>

              {/* 3 Action Cards for Export */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Card 1: Full Export */}
                <div className="border border-neutral-200 rounded-xl p-4 bg-white flex flex-col justify-between space-y-4 hover:border-neutral-300 transition-colors shadow-2xs">
                  <div className="space-y-2">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <h4 className="text-xs font-bold text-neutral-900">
                      Exportar Cardápio Completo
                    </h4>
                    <p className="text-[11px] text-neutral-600 leading-relaxed">
                      Baixa todas as <strong>{categories.length} categorias</strong> e{' '}
                      <strong>{products.length} produtos</strong> atuais de{' '}
                      <strong>{tenant.name}</strong> (incluindo preços, fotos, status e grupos de adicionais).
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleExportFullCatalog}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Exportar Categorias + Produtos</span>
                  </button>
                </div>

                {/* Card 2: Categories Only Export */}
                <div className="border border-neutral-200 rounded-xl p-4 bg-white flex flex-col justify-between space-y-4 hover:border-neutral-300 transition-colors shadow-2xs">
                  <div className="space-y-2">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                      <Table className="w-5 h-5" />
                    </div>
                    <h4 className="text-xs font-bold text-neutral-900">
                      Exportar Somente Categorias
                    </h4>
                    <p className="text-[11px] text-neutral-600 leading-relaxed">
                      Baixa uma planilha enxuta com a ordem de exibição, nome das{' '}
                      <strong>{categories.length} categorias</strong> do restaurante e contagem de itens por seção.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleExportCategoriesOnly}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 text-xs font-semibold rounded-lg transition-colors"
                  >
                    <FileDown className="w-4 h-4" />
                    <span>Exportar Categorias (.CSV)</span>
                  </button>
                </div>

                {/* Card 3: Template for New Menu */}
                <div className="border border-orange-200 rounded-xl p-4 bg-orange-50/40 flex flex-col justify-between space-y-4 hover:border-orange-300 transition-colors shadow-2xs">
                  <div className="space-y-2">
                    <div className="w-9 h-9 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <h4 className="text-xs font-bold text-neutral-900">
                      Baixar Planilha Modelo
                    </h4>
                    <p className="text-[11px] text-neutral-600 leading-relaxed">
                      Ideal para montar um cardápio do zero! Baixe o modelo com colunas prontas e exemplos de preenchimento para abrir no Excel.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Baixar Planilha Modelo</span>
                  </button>
                </div>
              </div>

              {/* Column Structure Reference Table */}
              <div className="border border-neutral-200 rounded-xl overflow-hidden bg-white">
                <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-neutral-500" />
                    <h4 className="text-xs font-bold text-neutral-900">
                      Estrutura de Colunas da Planilha de Cardápio
                    </h4>
                  </div>
                  <span className="text-[11px] text-neutral-500">
                    Você pode editar no Excel e reimportar a qualquer momento
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-neutral-50/60 border-b border-neutral-200 text-neutral-700">
                      <tr>
                        <th className="p-2.5 text-left font-semibold">Coluna na Planilha</th>
                        <th className="p-2.5 text-left font-semibold">Obrigatório?</th>
                        <th className="p-2.5 text-left font-semibold">Como preencher / Exemplo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 text-[11px]">
                      <tr>
                        <td className="p-2.5 font-mono font-bold text-neutral-900">Ordem_Categoria</td>
                        <td className="p-2.5 text-neutral-500">Opcional</td>
                        <td className="p-2.5 text-neutral-600">
                          Número da posição da categoria no cardápio (Ex: <code className="bg-neutral-100 px-1 rounded">1</code>, <code className="bg-neutral-100 px-1 rounded">2</code>, <code className="bg-neutral-100 px-1 rounded">3</code>)
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-mono font-bold text-neutral-900">Categoria</td>
                        <td className="p-2.5 text-emerald-700 font-semibold">Sim</td>
                        <td className="p-2.5 text-neutral-600">
                          Nome da seção do cardápio (Ex: <code className="bg-neutral-100 px-1 rounded">Smash Burgers</code>, <code className="bg-neutral-100 px-1 rounded">Bebidas Geladas</code>). Se não existir, é criada automaticamente.
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-mono font-bold text-neutral-900">Nome_Produto</td>
                        <td className="p-2.5 text-emerald-700 font-semibold">Sim (para pratos)</td>
                        <td className="p-2.5 text-neutral-600">
                          Nome do prato ou bebida (Ex: <code className="bg-neutral-100 px-1 rounded">Duplo Bacon Artesanal</code>). Deixe em branco se quiser criar apenas a categoria.
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-mono font-bold text-neutral-900">Descricao</td>
                        <td className="p-2.5 text-neutral-500">Opcional</td>
                        <td className="p-2.5 text-neutral-600">
                          Ingredientes, peso ou detalhes do prato que aparecem abaixo do título.
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-mono font-bold text-neutral-900">Preco_BRL</td>
                        <td className="p-2.5 text-emerald-700 font-semibold">Sim (para pratos)</td>
                        <td className="p-2.5 text-neutral-600">
                          Valor em Reais (aceita <code className="bg-neutral-100 px-1 rounded">34,90</code>, <code className="bg-neutral-100 px-1 rounded">R$ 34,90</code> ou <code className="bg-neutral-100 px-1 rounded">34.90</code>).
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-mono font-bold text-neutral-900">Disponivel</td>
                        <td className="p-2.5 text-neutral-500">Opcional</td>
                        <td className="p-2.5 text-neutral-600">
                          <code className="bg-neutral-100 px-1 rounded">SIM</code> para liberar vendas ou <code className="bg-neutral-100 px-1 rounded">NAO</code> para cadastrar pausado/esgotado.
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-mono font-bold text-neutral-900">Adicionais</td>
                        <td className="p-2.5 text-neutral-500">Opcional</td>
                        <td className="p-2.5 text-neutral-600">
                          Grupos separados por <code className="bg-neutral-100 px-1 rounded">||</code>. Ex: <code className="bg-neutral-100 px-1 rounded">Ponto da Carne (Obrigatorio,1,1): Ao Ponto=0,00 | Bem Passado=0,00</code>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: IMPORTAR PLANILHA PARA MONTAR CARDÁPIO                  */}
          {/* ============================================================== */}
          {activeTab === 'import' && (
            <div className="space-y-5">
              {/* Step 1: Import Mode Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setImportMode('merge')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    importMode === 'merge'
                      ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                      : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5" />
                      Modo 1: Mesclar e Atualizar Cardápio Atual
                    </span>
                    {importMode === 'merge' && (
                      <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded">
                        Recomendado
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-[11px] mt-1 leading-relaxed ${
                      importMode === 'merge' ? 'text-neutral-300' : 'text-neutral-500'
                    }`}
                  >
                    Cria novas categorias e produtos da planilha e atualiza preços/descrições de itens com o mesmo nome, mantendo os demais pratos.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setImportMode('replace')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    importMode === 'replace'
                      ? 'border-orange-600 bg-orange-600 text-white shadow-xs'
                      : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Modo 2: Substituir e Montar do Zero
                    </span>
                    {importMode === 'replace' && (
                      <span className="text-[10px] font-mono bg-white/20 text-white px-2 py-0.5 rounded">
                        Substituição Total
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-[11px] mt-1 leading-relaxed ${
                      importMode === 'replace' ? 'text-orange-100' : 'text-neutral-500'
                    }`}
                  >
                    Substitui todas as categorias e produtos atuais de {tenant.name} exclusivamente pelos itens enviados na planilha.
                  </p>
                </button>
              </div>

              {/* Step 2: Upload CSV file or Paste directly from Excel / Google Sheets */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* File Dropzone */}
                <div className="lg:col-span-5 border-2 border-dashed border-neutral-300 hover:border-neutral-900 rounded-xl p-5 bg-neutral-50 flex flex-col items-center justify-center text-center space-y-3 transition-colors">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt,.tsv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div className="w-11 h-11 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-700 shadow-2xs">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-neutral-900">
                      Enviar Arquivo da Planilha (.CSV)
                    </p>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      Salve sua planilha do Excel ou Google Sheets como <strong>CSV</strong> e selecione aqui.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs"
                    >
                      Escolher Arquivo .CSV
                    </button>

                    <button
                      type="button"
                      onClick={handleLoadSampleIntoPreview}
                      className="px-3 py-2 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-300 text-xs font-semibold rounded-lg transition-colors"
                    >
                      Carregar Exemplo
                    </button>
                  </div>

                  {uploadedFileName && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-900">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      {uploadedFileName}
                    </span>
                  )}
                </div>

                {/* Direct Copy-Paste from Excel / Google Sheets */}
                <div className="lg:col-span-7 border border-neutral-200 rounded-xl p-4 bg-white flex flex-col space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                      <ClipboardPaste className="w-4 h-4 text-neutral-600" />
                      <span>Ou cole diretamente do Excel / Google Planilhas (Ctrl+V):</span>
                    </label>
                    {rawInputText && (
                      <button
                        type="button"
                        onClick={() => {
                          setRawInputText('');
                          setParsedRows([]);
                          setUploadedFileName(null);
                        }}
                        className="text-[11px] text-rose-600 hover:underline font-medium"
                      >
                        Limpar texto
                      </button>
                    )}
                  </div>

                  <textarea
                    rows={5}
                    value={rawInputText}
                    onChange={(e) => processSpreadsheetText(e.target.value, 'Dados colados manualmente')}
                    placeholder={
                      'Ordem_Categoria;Categoria;Nome_Produto;Descricao;Preco_BRL;Disponivel\n1;Hambúrgueres;Smash Bacon;Dois blends 90g e bacon;34,90;SIM\n2;Bebidas;Coca-Cola Lata 350ml;Lata gelada;7,50;SIM'
                    }
                    className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg font-mono text-[11px] text-neutral-800 focus:bg-white focus:outline-neutral-900"
                  />
                  <p className="text-[10px] text-neutral-500">
                    Dica: Você pode selecionar as células direto no Excel ou Google Sheets, copiar (<kbd className="px-1 py-0.5 bg-neutral-100 border border-neutral-300 rounded">Ctrl+C</kbd>) e colar (<kbd className="px-1 py-0.5 bg-neutral-100 border border-neutral-300 rounded">Ctrl+V</kbd>) no campo acima!
                  </p>
                </div>
              </div>

              {/* Step 3: Live Validation & Preview Table */}
              {parsedRows.length > 0 && (
                <div className="border border-neutral-200 rounded-xl overflow-hidden bg-white space-y-0">
                  <div className="p-3.5 bg-neutral-50 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-neutral-900">
                        Pré-visualização do Cardápio a Importar
                      </h4>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                        <FolderPlus className="w-3.5 h-3.5" />
                        {distinctCategoryNames.length} Categorias detectadas
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <PackagePlus className="w-3.5 h-3.5" />
                        {validProductRows.length} Produtos válidos
                      </span>
                      {errorRows.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                          <AlertCircle className="w-3.5 h-3.5" />
                          {errorRows.length} linha(s) com erro
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-neutral-100 border-b border-neutral-200 text-neutral-700 sticky top-0">
                        <tr>
                          <th className="p-2.5 text-left">Linha</th>
                          <th className="p-2.5 text-left">Categoria (Ordem)</th>
                          <th className="p-2.5 text-left">Produto &amp; Descrição</th>
                          <th className="p-2.5 text-right">Preço</th>
                          <th className="p-2.5 text-center">Status</th>
                          <th className="p-2.5 text-left">Validação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200 text-[11px]">
                        {parsedRows.map((r, i) => (
                          <tr
                            key={`${r.rowNumber}_${i}`}
                            className={r.status === 'error' ? 'bg-rose-50/50' : 'hover:bg-neutral-50'}
                          >
                            <td className="p-2.5 font-mono text-neutral-400">#{r.rowNumber}</td>
                            <td className="p-2.5 font-semibold text-neutral-800">
                              <span className="font-mono text-[10px] text-neutral-400 mr-1.5">
                                [{r.categoryOrder}]
                              </span>
                              {r.categoryName}
                            </td>
                            <td className="p-2.5">
                              {r.status === 'category_only' ? (
                                <span className="italic text-neutral-400">
                                  (Somente criação da categoria)
                                </span>
                              ) : (
                                <div>
                                  <p className="font-bold text-neutral-900">{r.productName}</p>
                                  {r.description && (
                                    <p className="text-neutral-500 truncate max-w-xs">{r.description}</p>
                                  )}
                                  {r.optionGroups.length > 0 && (
                                    <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
                                      + {r.optionGroups.length} grupo(s) de adicionais configurado(s)
                                    </p>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-neutral-900">
                              {r.status === 'category_only' ? '—' : formatBRL(r.priceCents)}
                            </td>
                            <td className="p-2.5 text-center">
                              {r.status === 'category_only' ? (
                                '—'
                              ) : (
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    r.isAvailable
                                      ? 'bg-emerald-50 text-emerald-800'
                                      : 'bg-neutral-100 text-neutral-600'
                                  }`}
                                >
                                  {r.isAvailable ? 'Disponível' : 'Pausado'}
                                </span>
                              )}
                            </td>
                            <td className="p-2.5">
                              {r.status === 'error' ? (
                                <span className="text-rose-700 font-medium flex items-center gap-1">
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                  {r.errorMessage}
                                </span>
                              ) : (
                                <span className="text-emerald-700 font-medium flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  Pronto para importar
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-neutral-500">
            Restaurante ativo: <strong className="text-neutral-900">{tenant.name}</strong> (isolamento multi-tenant ativo)
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-200 rounded-lg transition-colors"
            >
              Fechar
            </button>

            {activeTab === 'import' && (
              <button
                type="button"
                disabled={validRows.length === 0}
                onClick={handleConfirmImport}
                className={`flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-lg transition-colors shadow-xs ${
                  validRows.length > 0
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  Confirmar e Montar Cardápio ({distinctCategoryNames.length} cat. / {validProductRows.length} prod.)
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
