FROM victoriametrics/vmagent:latest

VOLUME [ "/vmagentdata" ]

EXPOSE 8429

ENTRYPOINT [ "/vmagent-prod" ]

#remoteWrite.url is where we forward metrics when collected i.e vminsert
#remoteWrite.tmpDataPath is a buffer/write-ahead queue in case vminsert goes down
#remote.streamAggr is the aggregation yaml that we use to apply things like metric aggregation or label normalisation
CMD [ \
  "--remoteWrite.tmpDataPath=/vmagentdata", \
  # url[0]: vminsert receives aggregated metrics (drop_input per-rule) and label-dropped metrics
  "--remoteWrite.url=http://vminsert:8480/insert/0/prometheus/api/v1/write", \
  "--remoteWrite.streamAggr.config=/etc/vmagent/aggregations.yml", \
  "--remoteWrite.streamAggr.dropInput=true", \
  "--remoteWrite.urlRelabelConfig=/etc/vmagent/relabel.yml", \
  # url[1]: vector receives raw metrics only — aggregated output (colon-suffixed names) is dropped
  "--remoteWrite.url=http://vector:9090/", \
  "--remoteWrite.urlRelabelConfig=/etc/vmagent/vector_relabel.yml" \
]