import NativeFile from '@specs/NativeFile';
import type { IFileService, ReadDirResult } from '../types';

export const FileService: IFileService = {
  writeFile: (path, content) => NativeFile.writeFile(path, content),
  readFile: path => NativeFile.readFile(path),
  copyFile: (src, dest) => NativeFile.copyFile(src, dest),
  moveFile: (src, dest) => NativeFile.moveFile(src, dest),
  exists: path => NativeFile.exists(path),
  mkdir: path => NativeFile.mkdir(path),
  unlink: path => NativeFile.unlink(path),
  readDir: path => NativeFile.readDir(path) as ReadDirResult[],
  downloadFile: (url, dest, method, headers, body) =>
    NativeFile.downloadFile(url, dest, method, headers, body),
  getExternalDirectoryPath: () =>
    NativeFile.getConstants().ExternalDirectoryPath,
  getExternalCachesDirectoryPath: () =>
    NativeFile.getConstants().ExternalCachesDirectoryPath,
};
