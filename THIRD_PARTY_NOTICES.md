# Third-party notices

This repository's own source code is licensed under the MIT License; see
[`LICENSE`](LICENSE).

The application depends on the following third-party packages. They are not
vendored into this repository; `npm install` obtains them from npm.

| Component | Version range used | License | Upstream |
| --- | --- | --- | --- |
| Express | `^5.1.0` | MIT | https://github.com/expressjs/express |
| Socket.IO | `^4.8.1` | MIT | https://github.com/socketio/socket.io |
| csv-parse | `^6.1.0` | MIT | https://github.com/adaltas/node-csv |
| SortableJS | `^1.15.6` | MIT | https://github.com/SortableJS/Sortable |

When redistributing installed dependencies (for example by shipping a bundle
that includes `node_modules`), preserve the copyright and license notices
included with those packages and their transitive dependencies.

## Optional fonts

Font binaries are intentionally **not included** in this repository.
The UI can load locally hosted copies placed in `public/fonts/`.

### Jost

Jost is available under the SIL Open Font License 1.1. If you redistribute a
Jost font file with this project, keep the OFL notice with it. A copy of the
upstream Jost OFL text is provided at
[`licenses/fonts/JOST-OFL-1.1.txt`](licenses/fonts/JOST-OFL-1.1.txt).

Upstream: https://github.com/indestructible-type/Jost

### Kazesawa

Kazesawa is distributed under the SIL Open Font License 1.1 and combines M+
and Source Sans Pro. If you redistribute Kazesawa binaries, preserve the
license/readme files supplied with the exact upstream release, including the
notices for its source-font components. See
[`licenses/fonts/KAZESAWA-NOTICE.md`](licenses/fonts/KAZESAWA-NOTICE.md).

Upstream: https://github.com/kazesawa/kazesawa
