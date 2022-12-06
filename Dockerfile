FROM node:18

ARG MAX_OLD_SPACE_SIZE=8192
ENV NODE_OPTIONS=--max-old-space-size=${MAX_OLD_SPACE_SIZE}

WORKDIR /paraspace

COPY . /paraspace
RUN yarn && yarn build

# https://docs.docker.com/config/containers/multi-service_container/
RUN echo '#!/bin/bash\nset -m\nmake hardhat &\nsleep 30 && make deploy && make transfer-tokens\nfg %1' > .entrypoint.sh
RUN chmod u+x .entrypoint.sh

ENTRYPOINT ["/paraspace/.entrypoint.sh"]
