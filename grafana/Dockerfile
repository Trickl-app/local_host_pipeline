FROM grafana/grafana:12.4.2

RUN grafana-cli plugins install marcusolsson-json-datasource

# Bake the plugin into the image
COPY plugin-dist/trickl-trickl-app /var/lib/grafana/plugins/trickl-trickl-app

# Bake provisioning config into the image
COPY provisioning /etc/grafana/provisioning

# Allow the unsigned plugin to load (safe for internal images)
ENV GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=trickl-trickl-app

EXPOSE 3000
