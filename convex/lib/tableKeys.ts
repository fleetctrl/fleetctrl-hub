export function computerSearchText(name: string, loginUser?: string) {
    return `${name} ${loginUser ?? ""}`.trim().toLowerCase();
}

const encodeNumber = (value: string) => {
    const normalized = value.replace(/^0+(?=\d)/, "") || "0";
    return `${normalized.length.toString().padStart(6, "0")}:${normalized}`;
};

const naturalTextKey = (value: string) => value
    .split(/(\d+)/)
    .filter(Boolean)
    .map((part) => /^\d+$/.test(part) ? `1${encodeNumber(part)}` : `0${part}`)
    .join("|");

export function versionSortKey(version: string) {
    const normalized = version.trim().toLowerCase();
    if (!normalized || normalized === "latest") return "2|";

    const match = normalized.replace(/^v/, "").match(/^(\d+(?:\.\d+)*)(?:-([0-9a-z.-]+))?$/);
    if (!match) return `0|${naturalTextKey(normalized)}`;

    const [, numeric, prerelease] = match;
    const [major, minor = "0", patch = "0", ...extra] = numeric.split(".");
    return [
        "1",
        encodeNumber(major),
        encodeNumber(minor),
        encodeNumber(patch),
        ...extra.map((part) => `2${encodeNumber(part)}`),
        prerelease ? "0" : "1",
        prerelease ? naturalTextKey(prerelease) : "",
    ].join("|");
}
