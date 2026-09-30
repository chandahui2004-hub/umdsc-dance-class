// Ported from DanceCue by JzeAnson (https://github.com/JzeAnson/DanceCue), used with permission.

const databaseName = "dancecue:audio:v1";
const storeName = "audioFiles";
const currentAudioFileId = "current";

type StoredAudioFileRecord = {
  blob: Blob;
  id: string;
  lastModified: number;
  name: string;
  type: string;
};

function openAudioDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, 1);

    request.addEventListener("upgradeneeded", () => {
      request.result.createObjectStore(storeName, { keyPath: "id" });
    });

    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function runAudioFileTransaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T> | void,
) {
  const database = await openAudioDatabase();

  return new Promise<T | undefined>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = action(store);
    let result: T | undefined;

    if (request) {
      request.addEventListener("success", () => {
        result = request.result;
      });
      request.addEventListener("error", () => reject(request.error));
    }

    transaction.addEventListener("complete", () => {
      database.close();
      resolve(result);
    });
    transaction.addEventListener("error", () => {
      database.close();
      reject(transaction.error);
    });
    transaction.addEventListener("abort", () => {
      database.close();
      reject(transaction.error);
    });
  });
}

export function saveStoredAudioFile(file: File) {
  const record: StoredAudioFileRecord = {
    blob: file,
    id: currentAudioFileId,
    lastModified: file.lastModified,
    name: file.name,
    type: file.type,
  };

  return runAudioFileTransaction("readwrite", (store) => store.put(record));
}

export async function readStoredAudioFile() {
  const record = await runAudioFileTransaction<StoredAudioFileRecord>("readonly", (store) =>
    store.get(currentAudioFileId),
  );

  if (!record) {
    return null;
  }

  return new File([record.blob], record.name, {
    lastModified: record.lastModified,
    type: record.type,
  });
}

export function deleteStoredAudioFile() {
  return runAudioFileTransaction("readwrite", (store) => store.delete(currentAudioFileId));
}
