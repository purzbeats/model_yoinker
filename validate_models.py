#!/usr/bin/env python3
"""
Validate supported_models.txt JSON file.
Checks for:
- JSON syntax errors
- Duplicate entries (by download URL)
- Missing required fields
"""

import json
import sys
from collections import defaultdict
from pathlib import Path


def validate_models(file_path: str) -> bool:
    """Validate the models JSON file and report issues."""

    path = Path(file_path)
    if not path.exists():
        print(f"Error: File not found: {file_path}")
        return False

    # Read and parse JSON
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading file: {e}")
        return False

    # Check for JSON syntax errors
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        print(f"JSON Syntax Error at line {e.lineno}, column {e.colno}:")
        print(f"  {e.msg}")

        # Show context around the error
        lines = content.split('\n')
        start = max(0, e.lineno - 3)
        end = min(len(lines), e.lineno + 2)

        print("\nContext:")
        for i in range(start, end):
            marker = ">>>" if i == e.lineno - 1 else "   "
            print(f"  {marker} {i + 1}: {lines[i]}")

        return False

    print(f"JSON syntax: OK")

    # Check structure
    if not isinstance(data, dict):
        print(f"Error: Root should be an object, got {type(data).__name__}")
        return False

    if 'models' not in data:
        print("Error: Missing 'models' array in root object")
        return False

    models = data['models']
    if not isinstance(models, list):
        print(f"Error: 'models' should be an array, got {type(models).__name__}")
        return False

    print(f"Total models: {len(models)}")

    # Track issues
    issues = []
    url_index = defaultdict(list)  # url -> list of (index, model_name)
    name_index = defaultdict(list)  # name -> list of (index, url)

    required_fields = ['model_name', 'url', 'directory']

    for i, model in enumerate(models):
        if not isinstance(model, dict):
            issues.append(f"  [{i}] Entry is not an object: {model}")
            continue

        # Check required fields
        for field in required_fields:
            if field not in model:
                issues.append(f"  [{i}] Missing required field '{field}': {model.get('model_name', 'unknown')}")

        # Track for duplicate detection
        url = model.get('url', '')
        name = model.get('model_name', '')

        if url:
            url_index[url].append((i, name))
        if name:
            name_index[name].append((i, url))

    # Check for duplicate URLs
    duplicate_urls = {url: entries for url, entries in url_index.items() if len(entries) > 1}

    # Check for duplicate names
    duplicate_names = {name: entries for name, entries in name_index.items() if len(entries) > 1}

    # Report issues
    has_issues = False

    if issues:
        has_issues = True
        print(f"\nField Issues ({len(issues)}):")
        for issue in issues:
            print(issue)

    if duplicate_urls:
        has_issues = True
        print(f"\nDuplicate URLs ({len(duplicate_urls)}):")
        for url, entries in duplicate_urls.items():
            print(f"  URL: {url}")
            for idx, name in entries:
                print(f"    [{idx}] {name}")

    if duplicate_names:
        has_issues = True
        print(f"\nDuplicate Model Names ({len(duplicate_names)}):")
        for name, entries in duplicate_names.items():
            print(f"  Name: {name}")
            for idx, url in entries:
                # Truncate URL for display
                display_url = url if len(url) < 60 else url[:57] + "..."
                print(f"    [{idx}] {display_url}")

    if not has_issues:
        print("\nNo issues found!")
        return True

    print(f"\nSummary:")
    print(f"  - Field issues: {len(issues)}")
    print(f"  - Duplicate URLs: {len(duplicate_urls)}")
    print(f"  - Duplicate names: {len(duplicate_names)}")

    return False


def main():
    # Default file path
    default_path = "supported_models.txt"

    # Allow override via command line
    file_path = sys.argv[1] if len(sys.argv) > 1 else default_path

    print(f"Validating: {file_path}\n")

    success = validate_models(file_path)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
