# ATP-OSM Sync

ATP-OSM Sync is a tool designed to keep OpenStreetMap (OSM) data up to date by matching it with data from [All The Places](https://alltheplaces.xyz) (ATP). It identifies discrepancies in brand data—such as opening hours, websites, and contact information—and facilitates the synchronization of this data with OSM.

## How It Works

The project processes "spiders" from All The Places and compares their output with existing OSM features. It uses various matching strategies (primarily `website`, `ref`, or other brand-specific identifiers) to link ATP points of interest with their OSM counterparts.

### Tiers

Spiders are organized into two tiers:

- **Preview Tier:** New spiders start here. This tier allows contributors and the community to review the matching accuracy and data quality. No automated changes are made to OSM for spiders in this tier.
- **Auto Tier:** Once a spider is verified to be highly accurate and reliable, it can be moved to the Auto tier. Spiders in this tier **automatically update OSM objects** when changes are detected in the source data. This includes updating existing tags and adding missing ones.

## Contributing

We welcome contributions of new spiders!

- To add a new brand, you should start by adding it to [`spiders_preview.json`](/spiders_preview.json).
- For detailed instructions on how to contribute, including configuration options and the review process, please see our **[`CONTRIBUTING.md`](/CONTRIBUTING.md)** guide.

## Translating

The dashboard is available in multiple languages. If you would like to help translate the interface, please take a look at the files in the [`src/locales/`](/src/locales/) directory. English (`en.json`) is the master locale. See the [Translations section in `CONTRIBUTING.md`](/CONTRIBUTING.md#translations) for more details.

## Installation and Local Development

To run the project locally, you will need Node.js and npm installed.

### Setup

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Sync Process

The sync process downloads ATP data and compares it with OSM. You can run it with:
```bash
npm run sync
```

To run a build with mock data (useful for frontend development):
```bash
npm run preview-build
```

### Frontend Development

The frontend is built using Preact and Vite.

- To build the frontend:
  ```bash
  npm run build:fe
  ```
- To lint the code:
  ```bash
  npm run lint
  ```
- To run tests:
  ```bash
  npm test
  ```

## License

This project is licensed under the GPL 3.0 only license. See the [`LICENSE`](/LICENSE) file for details.
