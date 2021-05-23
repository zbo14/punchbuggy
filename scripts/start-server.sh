#!/bin/bash

cd "$(dirname "$0")"/..

docker run \
  -d \
  --name punchbuggy \
  --network=host \
  --restart=always \
  -v "$PWD"/private:/punchbuggy/private:ro \
  punchbuggy
