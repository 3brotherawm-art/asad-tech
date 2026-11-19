/* AuraGallery Security Assistant — client-side image check.
   No AI key, no cost, no server. The check runs in the user's own
   browser/phone: the photo is never uploaded anywhere for the check.
   Uses nsfwjs (open-source, TensorFlow.js) — MobileNetV2 model.
   Verified 2026-11-19: nsfwjs 4.4.0 + tfjs 4.22.0, model bundles
   loaded as scripts first, then nsfwjs.load() with no URL.
   Block rule: Porn >= 0.5 or Hentai >= 0.5 -> blocked;
   Sexy >= 0.8 -> blocked; everything else -> safe.
   Honest limit: a client-side check can be bypassed by a technical
   user, so a server-side check comes later. The 20-person V1 test
   group is people Asad knows, so this is enough for the test. */
(function (global) {
  var TF_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
  var NSFW_BASE = 'https://cdn.jsdelivr.net/npm/nsfwjs@4.4.0/dist/';
  var MODEL_URL = NSFW_BASE + 'models/mobilenet_v2/model.min.js';
  var SHARD_URL = NSFW_BASE + 'models/mobilenet_v2/group1-shard1of1.min.js';
  var NSFW_URL = NSFW_BASE + 'browser/nsfwjs.min.js';

  var modelPromise = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Load nahi hua: ' + src)); };
      document.head.appendChild(s);
    });
  }

  /* Loads the model once, then reuses it. onStep('tf'|'model'|'nsfw')
     lets the page show progress. First load downloads ~7MB once,
     then the browser caches it. */
  function loadModel(onStep) {
    if (modelPromise) return modelPromise;
    modelPromise = (async function () {
      onStep && onStep('tf');
      await loadScript(TF_URL);
      onStep && onStep('model');
      await loadScript(MODEL_URL);
      await loadScript(SHARD_URL);
      onStep && onStep('nsfw');
      await loadScript(NSFW_URL);
      if (!global.nsfwjs) {
        throw new Error('Security check load nahi hua. Internet check kar ke dobara try karein.');
      }
      var model = await global.nsfwjs.load();
      return model;
    })();
    modelPromise.catch(function () { modelPromise = null; });
    return modelPromise;
  }

  function verdictFrom(preds) {
    var map = {};
    preds.forEach(function (p) { map[p.className] = p.probability; });
    var porn = map.Porn || 0;
    var hentai = map.Hentai || 0;
    var sexy = map.Sexy || 0;
    if (porn >= 0.5 || hentai >= 0.5) {
      return { verdict: 'blocked', reason: porn >= hentai ? 'Porn' : 'Hentai', score: Math.max(porn, hentai) };
    }
    if (sexy >= 0.8) {
      return { verdict: 'blocked', reason: 'Sexy', score: sexy };
    }
    return { verdict: 'safe', reason: null, score: 0 };
  }

  /* img: an <img>, <video> or <canvas> element. */
  async function checkImage(img, onStep) {
    var model = await loadModel(onStep);
    var preds = await model.classify(img);
    var v = verdictFrom(preds);
    return { verdict: v.verdict, reason: v.reason, score: v.score, predictions: preds };
  }

  /* file: a File from an <input type=file>. Never uploads anything. */
  function checkFile(file, onStep) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        checkImage(img, onStep).then(function (r) {
          URL.revokeObjectURL(url);
          resolve(r);
        }).catch(function (e) {
          URL.revokeObjectURL(url);
          reject(e);
        });
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Photo load nahi hui. Dobara try karein.'));
      };
      img.src = url;
    });
  }

  global.AuraSecurity = {
    loadModel: loadModel,
    checkImage: checkImage,
    checkFile: checkFile
  };
})(window);
