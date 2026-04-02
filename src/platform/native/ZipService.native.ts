import NativeZipArchive from '@specs/NativeZipArchive';
import type { IZipService } from '../types';

export const ZipService: IZipService = {
  zip: (src, dest) => NativeZipArchive.zip(src, dest),
  unzip: (src, dest) => NativeZipArchive.unzip(src, dest),
  remoteUnzip: (dest, url, headers) =>
    NativeZipArchive.remoteUnzip(dest, url, headers),
  remoteZip: (src, url, headers) =>
    NativeZipArchive.remoteZip(src, url, headers),
};
