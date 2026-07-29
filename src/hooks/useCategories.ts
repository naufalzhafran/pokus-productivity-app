import { useCallback, useEffect, useRef, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { COLLECTIONS, categoryFromRecord, categoryToRecord, createPocketBaseId, listCategories, type CategoryRecord } from "@/lib/pocketbase-records";
import { CATEGORY_NAME_MAX_LENGTH } from "@/lib/workspace";
import type { Category, CategoryInput } from "@/types/task";

function validate(input: CategoryInput, categories: Category[], exceptId?: string) {
  const name = input.name.trim();
  if (!name || name.length > CATEGORY_NAME_MAX_LENGTH) throw new Error("Enter a category name up to 40 characters.");
  if (categories.some((category) => category.id !== exceptId && category.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0)) throw new Error("A category with this name already exists.");
  return name;
}

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const ref = useRef<Category[]>([]);
  const replace = useCallback((value: Category[]) => { ref.current = value; setCategories(value); }, []);
  useEffect(() => { let mounted = true; void listCategories().then((value) => { if (mounted) { replace(value); setLoadError(null); } }).catch(() => { if (mounted) setLoadError("Your categories could not be loaded."); }).finally(() => { if (mounted) setIsLoading(false); }); return () => { mounted = false; }; }, [replace]);
  const createCategory = useCallback(async (input: CategoryInput) => {
    const category: Category = { id: createPocketBaseId(), name: validate(input, ref.current), color: input.color, createdAt: Date.now(), updatedAt: Date.now() };
    const record = await pb.collection(COLLECTIONS.categories).create<CategoryRecord>(categoryToRecord(category), { requestKey: null });
    const saved = categoryFromRecord(record); replace([...ref.current, saved].sort((a, b) => a.name.localeCompare(b.name))); return saved;
  }, [replace]);
  const updateCategory = useCallback(async (id: string, input: CategoryInput) => {
    const previous = ref.current.find((item) => item.id === id);
    if (!previous) return false;
    const name = validate(input, ref.current, id);
    replace(ref.current.map((item) => item.id === id ? { ...item, name, color: input.color } : item).sort((a, b) => a.name.localeCompare(b.name)));
    try {
      const record = await pb.collection(COLLECTIONS.categories).update<CategoryRecord>(id, { name, color: input.color }, { requestKey: null });
      const saved = categoryFromRecord(record);
      replace(ref.current.map((item) => item.id === id ? saved : item).sort((a, b) => a.name.localeCompare(b.name)));
      return saved;
    } catch (error) {
      replace(ref.current.map((item) => item.id === id ? previous : item).sort((a, b) => a.name.localeCompare(b.name)));
      throw error;
    }
  }, [replace]);
  const deleteCategory = useCallback(async (id: string) => {
    const previous = ref.current.find((item) => item.id === id);
    if (!previous) return false;
    replace(ref.current.filter((item) => item.id !== id));
    try { await pb.collection(COLLECTIONS.categories).delete(id); return true; }
    catch (error) { replace([...ref.current, previous].sort((a, b) => a.name.localeCompare(b.name))); throw error; }
  }, [replace]);
  return { categories, isLoading, loadError, createCategory, updateCategory, deleteCategory };
}
