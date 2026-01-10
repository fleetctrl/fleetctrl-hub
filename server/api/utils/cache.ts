export async function invalidateCache(key: string) {
    const apiUrl = process.env.API_URL;
    const serviceRoleKey = process.env.SERVICE_ROLE_KEY;

    if (!apiUrl || !serviceRoleKey) {
        console.warn("API_URL or SERVICE_ROLE_KEY not set, skipping cache invalidation");
        return;
    }

    try {
        const response = await fetch(`${apiUrl}/internal/cache/invalidate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ key }),
        });

        if (!response.ok) {
            console.error(
                "Failed to invalidate cache:",
                response.status,
                await response.text()
            );
        }
    } catch (error) {
        console.error("Error invalidating cache:", error);
    }
}
