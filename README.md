# punchbuggy

Lightweight, zero-dependency toolkit for UDP hole punching.

![Punch holes with confidence!](https://github.com/zbo14/punchbuggy/blob/develop/assets/andy.gif)

## Install

`$ npm i punchbuggy`

## Usage

Both the server and client can be run from the command line.

### Server

First, you'll need to generate a private key and self-signed TLS certificate:

`$ npm run cert:generate`

This is used to encrypt traffic between clients and the server.

Once the credentials are generated, you can start the server:

`$ [ADDRESS=<ipv4_address>] [PORT=<port>] punchbuggy server`

`ADDRESS` and `PORT` specify the local IP address and port to listen on, respectively.

`ADDRESS` defaults to "0.0.0.0" and `PORT` defaults to 12435.

#### Docker

You can also create a Docker image for the server and run it in a container.

##### Build

Build the Docker image for the server:

`npm run server:build`

##### Start

Run a container with the image you built previously:

`npm run server:start`

##### Stop

Stop and remove the server container:

`npm run server:stop`

##### Logs

Tail the server container logs:

`npm run server:logs`

### Client

`$ [SERVER_ADDRESS=<ipv4_address>] [SERVER_PORT=<port>] punchbuggy client`

`SERVER_ADDRESS` and `SERVER_PORT` indicate the remote server address and port to connect to, respectively.

`SERVER_ADDRESS` defaults to "127.0.0.1" and `SERVER_PORT` defaults to 12435.

## Tests

Run the unit and integration tests:

`$ npm test`

## Linting

`npm run lint`

## Contributing

`punchbuggy` being buggy? Want a feature added? Whatever it is, feel free to [open an issue](https://github.com/zbo14/punchbuggy/issues) and/or [create a pull request](https://github.com/zbo14/punchbuggy/compare/develop...).

## Resources

* https://bford.info/pub/net/p2pnat/
