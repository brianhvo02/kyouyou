// Shared by the readers of X-Plane's .dat navigation files (earth_fix, earth_nav, earth_awy, earth_hold,
// earth_msa, earth_mora): the first line is the byte order (`I` or `A`), the second starts with the spec
// version (`1200 Version - …`), data rows follow with fields separated by any whitespace, and a `99` line
// ends the data.
export function datRows(text) {
    const lines = text.split(/\r?\n/);
    const version = (lines[1] ?? '').trim().split(/\s+/)[0] ?? '';
    const rows = [];
    for (let i = 2; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '')
            continue;
        if (line === '99')
            break;
        rows.push(line.split(/\s+/));
    }
    return { version, rows };
}
