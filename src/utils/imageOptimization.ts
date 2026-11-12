const DEFAULT_MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

interface OptimizeImageOptions {
  maxDimension: number;
  quality?: number;
  maxFileSizeBytes?: number;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('O arquivo selecionado não contém uma imagem válida.'));
    image.src = dataUrl;
  });
}

export async function optimizeImageFile(
  file: File,
  { maxDimension, quality = 0.8, maxFileSizeBytes = DEFAULT_MAX_FILE_SIZE_BYTES }: OptimizeImageOptions
): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Selecione um arquivo de imagem válido.');
  }
  if (file.size > maxFileSizeBytes) {
    throw new Error('A imagem deve ter no máximo 8 MB.');
  }

  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(originalDataUrl);
  if (!Number.isFinite(maxDimension) || maxDimension < 1 || image.naturalWidth * image.naturalHeight > 40000000) throw new Error('Dimensões de imagem inválidas ou muito grandes.');
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) return originalDataUrl;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);

  const webpDataUrl = canvas.toDataURL('image/webp', quality);
  if (webpDataUrl.startsWith('data:image/webp')) return webpDataUrl;
  return canvas.toDataURL('image/jpeg', quality);
}
