Prepare.js
==========

An easy method for executing JavaScript on the server in a browser-like
environment, or more fancily, a basic framework for isomorphic JavaScript
applications.

Prepare can process HTML files, executing JS snippets along the way. To specify
the content of a script tag should be executed by Prepare, give it a type
attribute of (or similar to) "server", such as:

    <script type="server">console.log('Hi!');</script>
    <script type="on/server">
        var db = require('../db');
        $('post').text(db.get(request.split('/').pop()));
    </script>

These are then executed in a browser-like environment. In addition to all
standard node-functionality, the following is currently also available:
  - DOM implementation courtesy of jsdom
  - A request- and response-object
  - jQuery
  - A few other useful small things, see the source for specifics

After parsing the whole document, Prepare removes all server-side code, adds a
few useful definitions for the client side, and returns the resulting HTML.
Client side script tags (lacking the "server" attribute) will not be executed by
Prepare. To specify a script should be executed on both client and server,
use a type of "client/server". Inside of these scripts, you can distinguish
between the two via the onServer and onClient attributes. Note that all of the
code inside these scripts will still be transmitted to the client, so make sure
that it doesn't contain any sensitive information.

Planned additions:
 - Client-side require, mimicking node's version
 - Similarly, an easy way to use client/server modules
 - Express-like additions to the request object (maybe even further integration?)
 - Ease of use (installation and basic usage should be as simple as possible,
   to make it worth using :P)
