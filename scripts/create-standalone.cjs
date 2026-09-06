const fs = require("fs");
const path = require("path");

const dist = path.resolve(__dirname, "..", "dist");
const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const jsFile = html.match(/src="\.\/assets\/([^"]+\.js)"/)?.[1];
const cssFile = html.match(/href="\.\/assets\/([^"]+\.css)"/)?.[1];

if (!jsFile || !cssFile) {
  throw new Error("Could not find built JS/CSS assets in dist/index.html");
}

const css = fs.readFileSync(path.join(dist, "assets", cssFile), "utf8");
const js = fs
  .readFileSync(path.join(dist, "assets", jsFile), "utf8")
  .replaceAll("</script", "<\\/script")
  .replaceAll("/drum_kit.png", "./drum_kit.png")
  .replaceAll("/favicon.svg", "./favicon.svg");

const standalone = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DrumUp - Drum Practice</title>
    <style>
${css}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
${js}
    </script>
  </body>
</html>
`;

const outputPath = path.join(dist, "standalone.html");
fs.writeFileSync(outputPath, standalone, "utf8");
console.log(outputPath);
