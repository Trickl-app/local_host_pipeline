FROM timberio/vector:latest-alpine

COPY vector.toml /etc/vector/vector.toml

EXPOSE 9090

CMD [ \
  "--config", \
  "/etc/vector/vector.toml" \
]