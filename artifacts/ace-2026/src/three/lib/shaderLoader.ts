const shaderCache = new Map<string, string>();

/**
 * Loads a shader from the given public path, caching the result.
 * Throws a descriptive error if the fetch fails.
 */
export async function loadShader(path: string): Promise<string> {
  if (shaderCache.has(path)) {
    return shaderCache.get(path)!;
  }

  try {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(
        `Failed to load shader from path "${path}". Server responded with status: ${response.status} ${response.statusText}`
      );
    }
    const glsl = await response.text();
    shaderCache.set(path, glsl);
    return glsl;
  } catch (error: any) {
    // If it's already our descriptive error, rethrow it
    if (error.message && error.message.includes('Failed to load shader from path')) {
      throw error;
    }
    // Otherwise, wrap any generic network/fetch error in a descriptive message
    throw new Error(
      `Network or unexpected error while fetching shader from "${path}": ${error?.message || error}`
    );
  }
}
