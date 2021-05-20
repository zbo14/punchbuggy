#!/bin/bash

cd "$(dirname "$0")"/..

docker run \
  -d \
  -p 12435:12435 \
  --name punchbuggy \
  --restart=always \
  -v "$PWD"/private:/punchbuggy/private:ro \
  punchbuggy
