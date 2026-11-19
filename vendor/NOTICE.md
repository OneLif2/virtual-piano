# MP3 encoder notices

Nocturne Piano encodes MP3 with LAME via the [lamejs](https://github.com/zhuker/lamejs) JavaScript port by Alex Zhukov (zhuker). See the [LAME project](https://lame.sourceforge.io/). The package metadata identifies `LGPL-3.0` for lamejs; the accompanying original notices also cover underlying LAME code and include an older LGPL text. See the accompanying licenses and notices.

`lame.min.js` is the unmodified browser distribution from the official `lamejs@1.2.1` npm package. `lamejs-1.2.1-source.tgz` is the complete corresponding upstream npm package, containing JavaScript sources, scripts, notices, and upstream materials. It is also available from the [official npm registry](https://registry.npmjs.org/lamejs/-/lamejs-1.2.1.tgz). The encoder is loaded as an independent script: replace `vendor/lame.min.js` with your compatible, modified build to use it with the site.
