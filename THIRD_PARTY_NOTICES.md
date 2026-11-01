# Third-party notices

Math Rush application source and its original documentation are licensed under
the [MIT License](LICENSE). Third-party software, services, models, and linked
learning resources retain their own licenses and terms.

## Three.js

The main practice screen loads Three.js 0.170.0, and the standalone runner loads
0.149.0, from jsDelivr. These libraries are not bundled in this repository.
If you vendor them for an offline deployment, retain their license notices.

Sources: [r170](https://github.com/mrdoob/three.js/tree/r170),
[r149](https://github.com/mrdoob/three.js/tree/r149).
Upstream licenses: [r170 LICENSE](https://github.com/mrdoob/three.js/blob/r170/LICENSE),
[r149 LICENSE](https://github.com/mrdoob/three.js/blob/r149/LICENSE).

The MIT License

Copyright © 2010-2024 three.js authors (0.170.0)

Copyright © 2010-2023 three.js authors (0.149.0)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## Embedded outline icons

The embedded settings and clock SVGs use Lucide/Feather-style paths. Attribution
is retained for those icon families. See the [Lucide license](https://github.com/lucide-icons/lucide/blob/main/LICENSE)
and [Feather license](https://github.com/feathericons/feather/blob/main/LICENSE).

ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

The MIT License (MIT)

Copyright (c) 2013-2023 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Fonts and artwork

The interface uses locally available Inter and system-font fallbacks. No font
files are distributed or requested from a font provider by the current source.
`outputs/runner-cover.jpg` is an original Math Rush gameplay screenshot,
released with the project under MIT. It depicts the bundled procedural
Three.js runner: a violet bead squad and arithmetic gates. The scene uses
generated geometry and canvas labels, with no external image or texture
assets loaded. Provenance: [commit 1943934](https://github.com/kamilch1k/math-rush/commit/194393460c0a240936972acf7ece8240ecf6002e),
18 September 2026, "Runner catalog cover uses real gameplay screenshot";
the image was also checked against the bundled runner scene. Three.js itself
retains the separate MIT notices above.

## Development tooling

Wrangler 4.156.0 is a development dependency under `MIT OR Apache-2.0`.
Its dependencies, including optional native image libraries, retain their own
licenses in their installed packages. `node_modules` is not distributed with
the Math Rush source. Preserve those packages' notices if redistributing the
tooling itself. See the [Workers SDK license files](https://github.com/cloudflare/workers-sdk).

## Optional hosted services and AI

Cloudflare Workers, D1, Workers AI, and the Cloudflare Web Analytics script are
external services, not software relicensed by Math Rush. The static trainers
can be hosted without the account backend. Legacy pages currently request
`https://static.cloudflareinsights.com/beacon.min.js` for Web Analytics;
visitors' browsers contact Cloudflare when loading that script. A self-hosted
deployment can remove those script tags without changing the trainers. See
Cloudflare's [Web Analytics documentation](https://developers.cloudflare.com/web-analytics/)
for the service's data handling. Math Rush does not claim that a page loading
external scripts makes no third-party requests.

The optional configured hint model is Meta Llama 3.2, hosted by Workers AI.
Built with Llama. Its model materials use the
[Llama 3.2 Community License](https://github.com/meta-llama/llama-models/blob/main/models/llama3_2/LICENSE)
and [Acceptable Use Policy](https://www.llama.com/llama3_2/use-policy), not MIT.
No model weights are distributed in this repository. Changing the model may
require updating this attribution and observing the replacement's terms.

External exam and learning links point to their publishers' resources; those
resources are not included in this repository's license grant.
