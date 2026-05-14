FROM victoriametrics/vmstorage:latest

VOLUME [ "/storage" ]

# ports for http, write, and read respectively
EXPOSE 8482 8400 8401

ENTRYPOINT [ "/vmstorage-prod" ]

# storageDataPath is where the data is on disk in the container
# retentionPeriod defines how many months to keep the data before it's dropped
CMD [ \
  "--storageDataPath=/storage", \
  "--retentionPeriod=1" \
]