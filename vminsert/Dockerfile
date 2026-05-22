FROM victoriametrics/vminsert:latest

EXPOSE 8480

ENTRYPOINT [ "/vminsert-prod" ]

# tells vminsert where the storage node is located (vmstorage); currently one node; this is the write port
CMD [ \
  "--storageNode=vmstorage:8400", \
  "-enableMetadata=true" \
]