#!/usr/bin/env python3
import sys, json, csv, io

def to_csv(csv_spec: dict) -> tuple[str, bytes]:
    rows = csv_spec.get("rows", [])
    # Column order: explicit "order" first, else keys of first row
    if "order" in csv_spec and csv_spec["order"]:
        headers = list(csv_spec["order"])
    elif rows:
        # union of keys in insertion order, preserving first row first
        keys = list(rows[0].keys())
        for r in rows[1:]:
            for k in r.keys():
                if k not in keys:
                    keys.append(k)
        headers = keys
    else:
        headers = []

    buf = io.StringIO(newline="")
    writer = csv.DictWriter(buf, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
    data = buf.getvalue().encode("utf-8")
    filename = csv_spec.get("filename", "export.csv")
    return filename, data

def main():
    # Read JSON spec from stdin
    raw = sys.stdin.read()
    spec = json.loads(raw)
    filename, data = to_csv(spec)
    # Write a tiny header with the filename, then a null byte, then the csv bytes.
    # This lets Node separate filename from bytes without temp files.
    sys.stdout.buffer.write(filename.encode("utf-8"))
    sys.stdout.buffer.write(b"\x00")
    sys.stdout.buffer.write(data)

if __name__ == "__main__":
    main()
