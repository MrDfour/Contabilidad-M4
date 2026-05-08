import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

export const saveToStorage = async (key: string, data: any): Promise<void> => {
  if (typeof window !== 'undefined' && window.electronAPI) {
    await window.electronAPI.saveData(key, data);
  } else if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform()) {
    await Filesystem.writeFile({
      path: `${key}.json`,
      data: JSON.stringify(data),
      directory: Directory.Data,
      encoding: Encoding.UTF8
    });
  } else {
    localStorage.setItem(key, JSON.stringify(data));
  }
};

export const loadFromStorage = async (key: string): Promise<any> => {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return await window.electronAPI.loadData(key);
  } else if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform()) {
    try {
      const result = await Filesystem.readFile({ path: `${key}.json`, directory: Directory.Data, encoding: Encoding.UTF8 });
      return JSON.parse(result.data as string);
    } catch {
      return null;
    }
  } else {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  }
};

export const migrateFromLocalStorage = async () => {
  const keys = ['contasis_journals', 'contasis_fixed_assets', 'contasis_final_inventories'];
  for (const key of keys) {
    const localData = localStorage.getItem(key);
    if (localData) {
      const existingPhysicalData = await loadFromStorage(key);
      if (!existingPhysicalData) {
        await saveToStorage(key, JSON.parse(localData));
      }
    }
  }
};
