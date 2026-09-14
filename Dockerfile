FROM nginx:stable-alpine

COPY index.html style.css favicon.svg *.js /usr/share/nginx/html/

RUN printf '%s\n' \
    'server {' \
    '  listen 80;' \
    '  server_name _;' \
    '  root /usr/share/nginx/html;' \
    '  index index.html;' \
    '  server_tokens off;' \
    '  add_header X-Content-Type-Options nosniff always;' \
    '  add_header Referrer-Policy strict-origin-when-cross-origin always;' \
    '  location / {' \
    '    try_files $uri $uri/ /index.html;' \
    '  }' \
    '}' > /etc/nginx/conf.d/default.conf

RUN nginx -t

EXPOSE 80
