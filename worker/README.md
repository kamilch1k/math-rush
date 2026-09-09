# Math Rush Worker

This Worker serves the files in `outputs/` as a multi-page site. Clean routes are
mapped to the corresponding HTML pages. `/api/check-handwriting` is intentionally
a server-side placeholder until a recognition provider and secret are configured.

Deploy from this directory with Wrangler after logging into the intended
Cloudflare account. No API secret belongs in the browser files.
