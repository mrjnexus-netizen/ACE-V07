export const loadShader = async (path: string): Promise<string> => {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load shader: ${path}`);
    return await res.text();
  } catch (error) {
    console.error(error);
    return '';
  }
};
