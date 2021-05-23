# punchbuggy

Lightweight, zero-dependency toolkit for UDP hole punching.

![Punch holes with confidence!](https://github.com/zbo14/punchbuggy/blob/develop/assets/andy.gif)

## Overview

`punchbuggy` allows users, presumably on NAT-ed home or office networks, to send/receive UDP datagrams *directly* to/from each other.

The user runs a client on their local machine, which establishes a secure connection (TLS) to a rendezvous server. The server responds with the client's contact information (i.e. public IPv4 address and port) and a peer's contact information (if requested). The client and its peer send UDP datagrams to each other and notify the rendezvous server once they receive a datagram from the other. Finally, the rendezvous server tells boths clients that they received datagrams from the other (e.g. the "hole punching" was successful). Now, the users can send datagrams directly to each other!

## Install

`$ npm i punchbuggy`

## Usage

You can run the client and server from the command line.

### Server

First, you'll need to generate a private key and self-signed TLS certificate:

`$ npm run cert:generate`

This is used to encrypt traffic between clients and the server.

Once the credentials are generated, you can start the server:

`$ [ADDRESS=<ipv4_address>] [PORT=<port>] punchbuggy listen`

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

#### Dial a peer

Perform a synchronized, hole-punching procedure to send UDP datagrams directly to a peer:

`$ [SERVER_ADDRESS=<ipv4_address>] [SERVER_PORT=<port>] punchbuggy dial`

`SERVER_ADDRESS` and `SERVER_PORT` indicate the remote server address and port to connect to, respectively.

`SERVER_ADDRESS` defaults to "127.0.0.1" and `SERVER_PORT` defaults to 12435.

You'll be prompted to enter a peer's session ID. You must ask the user for their session ID out-of-band. Similarly, you must share your session ID since they run the smae command at roughly the same time. If the dial procedure isn't completed within a matter of minutes, it will time out.

If/when the command completes successfully, users can subsequently send plaintext messages to each other from the command line.

**Note:** if users don't send messages or keep-alives, the NAT port mappings won't be perserved and the holes will become "unpunched".

#### Test network support for UDP hole punching

Some NAT routers don't support UDP hole punching.

`punchbuggy` has a `test` command that indicates whether dialing a peer should work on your current network:

`$ [SERVER1_ADDRESS=<ipv4_address>] [SERVER1_PORT=<port>] [SERVER2_ADDRESS=<ipv4_address>] [SERVER2_PORT=<port>] punchbuggy test`

You must specify 2 different IPv4 addresses to determine whether your public port (from the server's perspective) is consistent and thus conducive to UDP hole punching.

## Tests

Run the unit and integration tests:

`$ npm test`

## Linting

`npm run lint`

## Contributing

`punchbuggy` being buggy? Or want a feature added?

Feel free to [open an issue](https://github.com/zbo14/punchbuggy/issues) and/or [create a pull request](https://github.com/zbo14/punchbuggy/compare/develop...).

## Resources

* https://bford.info/pub/net/p2pnat/
