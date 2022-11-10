FROM node:18

WORKDIR /paraspace

COPY . /paraspace

RUN yarn && yarn build

# https://docs.docker.com/config/containers/multi-service_container/
RUN echo '#!/bin/bash\nset -m\nmake fork &\nmake deploy\nmake transfer-tokens\nfg %1' > .entrypoint.sh
RUN chmod u+x .entrypoint.sh

ENTRYPOINT ["/paraspace/.entrypoint.sh"]
