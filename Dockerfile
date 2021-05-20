FROM node:14.17.0-alpine

COPY . /punchbuggy

WORKDIR /punchbuggy

RUN apk update && \
    apk upgrade && \
    apk add --no-cache sudo && \
    npm i -g --production && \
    adduser -D punchbuggy && \
    echo "punchbuggy ALL=(ALL) NOPASSWD: /usr/local/bin/punchbuggy" > /etc/sudoers.d/punchbuggy && \
    chmod 0440 /etc/sudoers.d/punchbuggy

USER punchbuggy

ENTRYPOINT sudo punchbuggy server
