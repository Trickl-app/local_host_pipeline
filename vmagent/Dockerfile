FROM victoriametrics/vmagent:latest

VOLUME [ "/vmagentdata" ]

EXPOSE 8429

ENTRYPOINT [ "/vmagent-prod" ]

#remoteWrite.url is where we forward metrics when collected i.e vminsert
#remoteWrite.tmpDataPath is a buffer/write-ahead queue in case vminsert goes down
#remote.streamAggr is the aggregation yaml that we use to apply things like metric aggregation or label normalisation
CMD [ \
  "--remoteWrite.tmpDataPath=/vmagentdata", \
  # url[0]: vminsert receives only aggregated metrics
  # dropInput cannot be set in aggregations.yml; it is a CLI-only flag, specified once per url in positional order
  "--remoteWrite.url=http://vminsert:8480/insert/0/prometheus/api/v1/write", \
  "--remoteWrite.streamAggr.config=/etc/vmagent/aggregations.yml", \
  "--remoteWrite.streamAggr.dropInput=true", \
  "--remoteWrite.relabelConfig=/etc/vmagent/relabel.yml", \
  # url[1]: vector receives raw metrics for S3 archival, no aggregation or relabeling applied
  # previously had --remoteWrite.streamAggr.dropInput=false here, which caused vmagent to
  # broadcast aggregated output to vector in addition to raw metrics — removed to keep vector raw-only
  "--remoteWrite.url=http://vector:9090/" \
]