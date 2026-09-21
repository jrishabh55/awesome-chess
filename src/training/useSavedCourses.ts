import { useCallback, useEffect, useState } from 'react';
import { CURRICULUM_KEY, loadCurricula, type CurriculumSnapshot } from './curriculum';

function readCourses() {
  try {
    return { items: loadCurricula(), error: '' };
  } catch (error) {
    return {
      items: [] as CurriculumSnapshot[],
      error: error instanceof Error ? error.message : 'Learning history could not be loaded.',
    };
  }
}
export function useSavedCourses() {
  const [saved, setSaved] = useState(readCourses);
  const reload = useCallback(() => setSaved(readCourses()), []);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === CURRICULUM_KEY || event.key === null) reload();
    };
    window.addEventListener('storage', changed);
    window.addEventListener('focus', reload);
    return () => {
      window.removeEventListener('storage', changed);
      window.removeEventListener('focus', reload);
    };
  }, [reload]);
  return { ...saved, reload };
}
