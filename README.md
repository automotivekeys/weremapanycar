# We Remap Any Car

Website for We Remap Any Car, mobile ECU remapping and tuning within 20 miles of Blackburn.

- `src/template.html`: the whole design, data (services, towns, vehicles) and script in one file.
- `build.js`: makes a real page for every service and town in `docs/`, plus `sitemap.xml` and `robots.txt`.
- `docs/`: the built website. GitHub Pages serves this folder.

## Changing phone number and email
In `src/template.html`, find `const CONFIG={phone:'',email:''};`, change them, then run `node build.js` (needs Node and Playwright).

## Custom domain
When weremapanycar.com is pointed at GitHub Pages, add a file `docs/CNAME` containing `weremapanycar.com`.
