mkdir -p vendor/font-awesome/css vendor/font-awesome/webfonts

FA="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3"

curl -o vendor/font-awesome/css/all.min.css "$FA/css/all.min.css"

for f in fa-solid-900.woff2 fa-solid-900.ttf \
         fa-regular-400.woff2 fa-regular-400.ttf \
         fa-brands-400.woff2 fa-brands-400.ttf; do
  curl -o "vendor/font-awesome/webfonts/$f" "$FA/webfonts/$f"
done

curl -o vendor/marked.min.js "https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"

echo "全部下载完成 ✅"
find vendor -type f -exec ls -lh {} \;
