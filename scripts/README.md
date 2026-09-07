# Scripts

This directory contains utility and one-off data-fix scripts for the Trackstar fulfillment tool.

## Austin Marathon Results

Script to fetch race results from the Austin Marathon and Half Marathon.

### Usage

#### Search by Name

```bash
node scripts/austin-marathon-results.js <firstName> <lastName> [eventType]
```

#### Search by Bib Number

```bash
node scripts/austin-marathon-results.js --bib <bibNumber> [eventType]
```

### Event Types

- `marathon` - Full marathon (default)
- `halfMarathon` - Half marathon

### Examples

```bash
# Search for a marathon runner by name
node scripts/austin-marathon-results.js John Smith

# Search for a half marathon runner by name
node scripts/austin-marathon-results.js Jane Doe halfMarathon

# Search by bib number in marathon
node scripts/austin-marathon-results.js --bib 12345

# Search by bib number in half marathon
node scripts/austin-marathon-results.js --bib 12345 halfMarathon
```

### Output

The script returns the following information:
- Overall Place
- Gun Time
- Chip Time
- Bib Number
- First Name
- Last Name
- City
- State
- Division
- Class Position (Age Group Placement)

### Programmatic Usage

You can also import the functions in other modules:

```javascript
import { searchRunner, searchByBib, EVENTS } from './scripts/austin-marathon-results.js';

// Search by name
const result = await searchRunner('John', 'Smith', 'marathon');

// Search by bib
const result = await searchByBib('12345', 'halfMarathon');
```

## Other Scripts

### test-vimeo.js

Tests Vimeo API integration for video management.
