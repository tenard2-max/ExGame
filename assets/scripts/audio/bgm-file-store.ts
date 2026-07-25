const DATABASE_NAME = 'exgame-bgm';
const DATABASE_VERSION = 1;
const FILE_STORE = 'files';

interface StoredBgmFile {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: ArrayBuffer;
}

/**
 * 사용자가 등록한 배경음 파일을 IndexedDB에 보관합니다.
 */
export class BgmFileStore {
  private databasePromise: Promise<IDBDatabase> | null = null;

  async putFile(id: string, file: File): Promise<void> {
    const buffer = await file.arrayBuffer();
    const record: StoredBgmFile = {
      id,
      name: file.name,
      mimeType: file.type || 'audio/mpeg',
      buffer,
    };
    const database = await this.openDatabase();
    await requestToPromise(
      database.transaction(FILE_STORE, 'readwrite').objectStore(FILE_STORE).put(record),
    );
  }

  async getObjectUrl(id: string): Promise<string | null> {
    const database = await this.openDatabase();
    const record = await requestToPromise<StoredBgmFile | undefined>(
      database.transaction(FILE_STORE, 'readonly').objectStore(FILE_STORE).get(id),
    );
    if (!record) return null;
    const blob = new Blob([record.buffer], { type: record.mimeType });
    return URL.createObjectURL(blob);
  }

  async deleteFile(id: string): Promise<void> {
    const database = await this.openDatabase();
    await requestToPromise(
      database.transaction(FILE_STORE, 'readwrite').objectStore(FILE_STORE).delete(id),
    );
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(FILE_STORE)) {
          database.createObjectStore(FILE_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('BGM IndexedDB open failed'));
    });
    return this.databasePromise;
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}
