FROM victoriametrics/vmstorage:latest

VOLUME [ "/cache" ]

EXPOSE 8481

ENTRYPOINT [ "executable" ]

# identifies the storage node but points to a different port than vm insert (this is the read port)
# cacheDataPath caches query results to disk for repeat queries; optional
CMD [ \
  "--storageNode=vmstorage:8401", \
  "--cacheDataPath=/cache" \
]