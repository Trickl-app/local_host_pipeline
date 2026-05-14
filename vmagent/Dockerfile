FROM victoriametrics/vmagent:latest

VOLUME [ "/vmagentdata" ]

EXPOSE 8429

ENTRYPOINT [ "/vmagent-prod" ]

#promscrape.config determines where vmagent fings the scrape config file
#remoteWrite.url is where we forward metrics when collected i.e vminsert
#remoteWrite/tmpDataPath is a buffer/write-ahead queue in case vminsert goes down
# eventually add a path for the aggregations yaml file
CMD [ \
  "--promscrape.config=/etc/vmagent/config.yml", \
  "--remoteWrite.url=http://vminsert:8480/insert/0/prometheus/api/v1/write", \
  "--remoteWrite.tmpDataPath=/vmagentdata" \
]