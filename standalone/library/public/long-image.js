var LinganLongImage = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // client/long-image.mjs
  var long_image_exports = {};
  __export(long_image_exports, {
    LongImageError: () => LongImageError,
    renderLongImage: () => renderLongImage
  });

  // node_modules/fflate/esm/browser.js
  var u8 = Uint8Array;
  var u16 = Uint16Array;
  var i32 = Int32Array;
  var fleb = new u8([
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    1,
    1,
    1,
    2,
    2,
    2,
    2,
    3,
    3,
    3,
    3,
    4,
    4,
    4,
    4,
    5,
    5,
    5,
    5,
    0,
    /* unused */
    0,
    0,
    /* impossible */
    0
  ]);
  var fdeb = new u8([
    0,
    0,
    0,
    0,
    1,
    1,
    2,
    2,
    3,
    3,
    4,
    4,
    5,
    5,
    6,
    6,
    7,
    7,
    8,
    8,
    9,
    9,
    10,
    10,
    11,
    11,
    12,
    12,
    13,
    13,
    /* unused */
    0,
    0
  ]);
  var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
  var freb = function(eb, start) {
    var b = new u16(31);
    for (var i = 0; i < 31; ++i) {
      b[i] = start += 1 << eb[i - 1];
    }
    var r = new i32(b[30]);
    for (var i = 1; i < 30; ++i) {
      for (var j = b[i]; j < b[i + 1]; ++j) {
        r[j] = j - b[i] << 5 | i;
      }
    }
    return { b, r };
  };
  var _a = freb(fleb, 2);
  var fl = _a.b;
  var revfl = _a.r;
  fl[28] = 258, revfl[258] = 28;
  var _b = freb(fdeb, 0);
  var fd = _b.b;
  var revfd = _b.r;
  var rev = new u16(32768);
  for (i = 0; i < 32768; ++i) {
    x = (i & 43690) >> 1 | (i & 21845) << 1;
    x = (x & 52428) >> 2 | (x & 13107) << 2;
    x = (x & 61680) >> 4 | (x & 3855) << 4;
    rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
  }
  var x;
  var i;
  var hMap = (function(cd, mb, r) {
    var s = cd.length;
    var i = 0;
    var l = new u16(mb);
    for (; i < s; ++i) {
      if (cd[i])
        ++l[cd[i] - 1];
    }
    var le = new u16(mb);
    for (i = 1; i < mb; ++i) {
      le[i] = le[i - 1] + l[i - 1] << 1;
    }
    var co;
    if (r) {
      co = new u16(1 << mb);
      var rvb = 15 - mb;
      for (i = 0; i < s; ++i) {
        if (cd[i]) {
          var sv = i << 4 | cd[i];
          var r_1 = mb - cd[i];
          var v = le[cd[i] - 1]++ << r_1;
          for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
            co[rev[v] >> rvb] = sv;
          }
        }
      }
    } else {
      co = new u16(s);
      for (i = 0; i < s; ++i) {
        if (cd[i]) {
          co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
        }
      }
    }
    return co;
  });
  var flt = new u8(288);
  for (i = 0; i < 144; ++i)
    flt[i] = 8;
  var i;
  for (i = 144; i < 256; ++i)
    flt[i] = 9;
  var i;
  for (i = 256; i < 280; ++i)
    flt[i] = 7;
  var i;
  for (i = 280; i < 288; ++i)
    flt[i] = 8;
  var i;
  var fdt = new u8(32);
  for (i = 0; i < 32; ++i)
    fdt[i] = 5;
  var i;
  var flm = /* @__PURE__ */ hMap(flt, 9, 0);
  var fdm = /* @__PURE__ */ hMap(fdt, 5, 0);
  var shft = function(p) {
    return (p + 7) / 8 | 0;
  };
  var slc = function(v, s, e) {
    if (s == null || s < 0)
      s = 0;
    if (e == null || e > v.length)
      e = v.length;
    return new u8(v.subarray(s, e));
  };
  var ec = [
    "unexpected EOF",
    "invalid block type",
    "invalid length/literal",
    "invalid distance",
    "stream finished",
    "no stream handler",
    ,
    "no callback",
    "invalid UTF-8 data",
    "extra field too long",
    "date not in range 1980-2099",
    "filename too long",
    "stream finishing",
    "invalid zip data"
    // determined by unknown compression method
  ];
  var err = function(ind, msg, nt) {
    var e = new Error(msg || ec[ind]);
    e.code = ind;
    if (Error.captureStackTrace)
      Error.captureStackTrace(e, err);
    if (!nt)
      throw e;
    return e;
  };
  var wbits = function(d, p, v) {
    v <<= p & 7;
    var o = p / 8 | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
  };
  var wbits16 = function(d, p, v) {
    v <<= p & 7;
    var o = p / 8 | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
    d[o + 2] |= v >> 16;
  };
  var hTree = function(d, mb) {
    var t = [];
    for (var i = 0; i < d.length; ++i) {
      if (d[i])
        t.push({ s: i, f: d[i] });
    }
    var s = t.length;
    var t2 = t.slice();
    if (!s)
      return { t: et, l: 0 };
    if (s == 1) {
      var v = new u8(t[0].s + 1);
      v[t[0].s] = 1;
      return { t: v, l: 1 };
    }
    t.sort(function(a, b) {
      return a.f - b.f;
    });
    t.push({ s: -1, f: 25001 });
    var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
    t[0] = { s: -1, f: l.f + r.f, l, r };
    while (i1 != s - 1) {
      l = t[t[i0].f < t[i2].f ? i0++ : i2++];
      r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
      t[i1++] = { s: -1, f: l.f + r.f, l, r };
    }
    var maxSym = t2[0].s;
    for (var i = 1; i < s; ++i) {
      if (t2[i].s > maxSym)
        maxSym = t2[i].s;
    }
    var tr = new u16(maxSym + 1);
    var mbt = ln(t[i1 - 1], tr, 0);
    if (mbt > mb) {
      var i = 0, dt = 0;
      var lft = mbt - mb, cst = 1 << lft;
      t2.sort(function(a, b) {
        return tr[b.s] - tr[a.s] || a.f - b.f;
      });
      for (; i < s; ++i) {
        var i2_1 = t2[i].s;
        if (tr[i2_1] > mb) {
          dt += cst - (1 << mbt - tr[i2_1]);
          tr[i2_1] = mb;
        } else
          break;
      }
      dt >>= lft;
      while (dt > 0) {
        var i2_2 = t2[i].s;
        if (tr[i2_2] < mb)
          dt -= 1 << mb - tr[i2_2]++ - 1;
        else
          ++i;
      }
      for (; i >= 0 && dt; --i) {
        var i2_3 = t2[i].s;
        if (tr[i2_3] == mb) {
          --tr[i2_3];
          ++dt;
        }
      }
      mbt = mb;
    }
    return { t: new u8(tr), l: mbt };
  };
  var ln = function(n, l, d) {
    return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
  };
  var lc = function(c) {
    var s = c.length;
    while (s && !c[--s])
      ;
    var cl = new u16(++s);
    var cli = 0, cln = c[0], cls = 1;
    var w = function(v) {
      cl[cli++] = v;
    };
    for (var i = 1; i <= s; ++i) {
      if (c[i] == cln && i != s)
        ++cls;
      else {
        if (!cln && cls > 2) {
          for (; cls > 138; cls -= 138)
            w(32754);
          if (cls > 2) {
            w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
            cls = 0;
          }
        } else if (cls > 3) {
          w(cln), --cls;
          for (; cls > 6; cls -= 6)
            w(8304);
          if (cls > 2)
            w(cls - 3 << 5 | 8208), cls = 0;
        }
        while (cls--)
          w(cln);
        cls = 1;
        cln = c[i];
      }
    }
    return { c: cl.subarray(0, cli), n: s };
  };
  var clen = function(cf, cl) {
    var l = 0;
    for (var i = 0; i < cl.length; ++i)
      l += cf[i] * cl[i];
    return l;
  };
  var wfblk = function(out, pos, dat) {
    var s = dat.length;
    var o = shft(pos + 2);
    out[o] = s & 255;
    out[o + 1] = s >> 8;
    out[o + 2] = out[o] ^ 255;
    out[o + 3] = out[o + 1] ^ 255;
    for (var i = 0; i < s; ++i)
      out[o + i + 4] = dat[i];
    return (o + 4 + s) * 8;
  };
  var wblk = function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
    wbits(out, p++, final);
    ++lf[256];
    var _a2 = hTree(lf, 15), dlt = _a2.t, mlb = _a2.l;
    var _b2 = hTree(df, 15), ddt = _b2.t, mdb = _b2.l;
    var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
    var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
    var lcfreq = new u16(19);
    for (var i = 0; i < lclt.length; ++i)
      ++lcfreq[lclt[i] & 31];
    for (var i = 0; i < lcdt.length; ++i)
      ++lcfreq[lcdt[i] & 31];
    var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
    var nlcc = 19;
    for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
      ;
    var flen = bl + 5 << 3;
    var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
    var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
    if (bs >= 0 && flen <= ftlen && flen <= dtlen)
      return wfblk(out, p, dat.subarray(bs, bs + bl));
    var lm, ll, dm, dl;
    wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
    if (dtlen < ftlen) {
      lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
      var llm = hMap(lct, mlcb, 0);
      wbits(out, p, nlc - 257);
      wbits(out, p + 5, ndc - 1);
      wbits(out, p + 10, nlcc - 4);
      p += 14;
      for (var i = 0; i < nlcc; ++i)
        wbits(out, p + 3 * i, lct[clim[i]]);
      p += 3 * nlcc;
      var lcts = [lclt, lcdt];
      for (var it = 0; it < 2; ++it) {
        var clct = lcts[it];
        for (var i = 0; i < clct.length; ++i) {
          var len = clct[i] & 31;
          wbits(out, p, llm[len]), p += lct[len];
          if (len > 15)
            wbits(out, p, clct[i] >> 5 & 127), p += clct[i] >> 12;
        }
      }
    } else {
      lm = flm, ll = flt, dm = fdm, dl = fdt;
    }
    for (var i = 0; i < li; ++i) {
      var sym = syms[i];
      if (sym > 255) {
        var len = sym >> 18 & 31;
        wbits16(out, p, lm[len + 257]), p += ll[len + 257];
        if (len > 7)
          wbits(out, p, sym >> 23 & 31), p += fleb[len];
        var dst = sym & 31;
        wbits16(out, p, dm[dst]), p += dl[dst];
        if (dst > 3)
          wbits16(out, p, sym >> 5 & 8191), p += fdeb[dst];
      } else {
        wbits16(out, p, lm[sym]), p += ll[sym];
      }
    }
    wbits16(out, p, lm[256]);
    return p + ll[256];
  };
  var deo = /* @__PURE__ */ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
  var et = /* @__PURE__ */ new u8(0);
  var dflt = function(dat, lvl, plvl, pre, post, st) {
    var s = st.z || dat.length;
    var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7e3)) + post);
    var w = o.subarray(pre, o.length - post);
    var lst = st.l;
    var pos = (st.r || 0) & 7;
    if (lvl) {
      if (pos)
        w[0] = st.r >> 3;
      var opt = deo[lvl - 1];
      var n = opt >> 13, c = opt & 8191;
      var msk_1 = (1 << plvl) - 1;
      var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
      var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
      var hsh = function(i2) {
        return (dat[i2] ^ dat[i2 + 1] << bs1_1 ^ dat[i2 + 2] << bs2_1) & msk_1;
      };
      var syms = new i32(25e3);
      var lf = new u16(288), df = new u16(32);
      var lc_1 = 0, eb = 0, i = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
      for (; i + 2 < s; ++i) {
        var hv = hsh(i);
        var imod = i & 32767, pimod = head[hv];
        prev[imod] = pimod;
        head[hv] = imod;
        if (wi <= i) {
          var rem = s - i;
          if ((lc_1 > 7e3 || li > 24576) && (rem > 423 || !lst)) {
            pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
            li = lc_1 = eb = 0, bs = i;
            for (var j = 0; j < 286; ++j)
              lf[j] = 0;
            for (var j = 0; j < 30; ++j)
              df[j] = 0;
          }
          var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
          if (rem > 2 && hv == hsh(i - dif)) {
            var maxn = Math.min(n, rem) - 1;
            var maxd = Math.min(32767, i);
            var ml = Math.min(258, rem);
            while (dif <= maxd && --ch_1 && imod != pimod) {
              if (dat[i + l] == dat[i + l - dif]) {
                var nl = 0;
                for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl)
                  ;
                if (nl > l) {
                  l = nl, d = dif;
                  if (nl > maxn)
                    break;
                  var mmd = Math.min(dif, nl - 2);
                  var md = 0;
                  for (var j = 0; j < mmd; ++j) {
                    var ti = i - dif + j & 32767;
                    var pti = prev[ti];
                    var cd = ti - pti & 32767;
                    if (cd > md)
                      md = cd, pimod = ti;
                  }
                }
              }
              imod = pimod, pimod = prev[imod];
              dif += imod - pimod & 32767;
            }
          }
          if (d) {
            syms[li++] = 268435456 | revfl[l] << 18 | revfd[d];
            var lin = revfl[l] & 31, din = revfd[d] & 31;
            eb += fleb[lin] + fdeb[din];
            ++lf[257 + lin];
            ++df[din];
            wi = i + l;
            ++lc_1;
          } else {
            syms[li++] = dat[i];
            ++lf[dat[i]];
          }
        }
      }
      for (i = Math.max(i, wi); i < s; ++i) {
        syms[li++] = dat[i];
        ++lf[dat[i]];
      }
      pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
      if (!lst) {
        st.r = pos & 7 | w[pos / 8 | 0] << 3;
        pos -= 7;
        st.h = head, st.p = prev, st.i = i, st.w = wi;
      }
    } else {
      for (var i = st.w || 0; i < s + lst; i += 65535) {
        var e = i + 65535;
        if (e >= s) {
          w[pos / 8 | 0] = lst;
          e = s;
        }
        pos = wfblk(w, pos + 1, dat.subarray(i, e));
      }
      st.i = s;
    }
    return slc(o, 0, pre + shft(pos) + post);
  };
  var adler = function() {
    var a = 1, b = 0;
    return {
      p: function(d) {
        var n = a, m = b;
        var l = d.length | 0;
        for (var i = 0; i != l; ) {
          var e = Math.min(i + 2655, l);
          for (; i < e; ++i)
            m += n += d[i];
          n = (n & 65535) + 15 * (n >> 16), m = (m & 65535) + 15 * (m >> 16);
        }
        a = n, b = m;
      },
      d: function() {
        a %= 65521, b %= 65521;
        return (a & 255) << 24 | (a & 65280) << 8 | (b & 255) << 8 | b >> 8;
      }
    };
  };
  var dopt = function(dat, opt, pre, post, st) {
    if (!st) {
      st = { l: 1 };
      if (opt.dictionary) {
        var dict = opt.dictionary.subarray(-32768);
        var newDat = new u8(dict.length + dat.length);
        newDat.set(dict);
        newDat.set(dat, dict.length);
        dat = newDat;
        st.w = dict.length;
      }
    }
    return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20 : 12 + opt.mem, pre, post, st);
  };
  var wbytes = function(d, b, v) {
    for (; v; ++b)
      d[b] = v, v >>>= 8;
  };
  var zlh = function(c, o) {
    var lv = o.level, fl2 = lv == 0 ? 0 : lv < 6 ? 1 : lv == 9 ? 3 : 2;
    c[0] = 120, c[1] = fl2 << 6 | (o.dictionary && 32);
    c[1] |= 31 - (c[0] << 8 | c[1]) % 31;
    if (o.dictionary) {
      var h = adler();
      h.p(o.dictionary);
      wbytes(c, 2, h.d());
    }
  };
  var Deflate = /* @__PURE__ */ (function() {
    function Deflate2(opts, cb) {
      if (typeof opts == "function")
        cb = opts, opts = {};
      this.ondata = cb;
      this.o = opts || {};
      this.s = { l: 0, i: 32768, w: 32768, z: 32768 };
      this.b = new u8(98304);
      if (this.o.dictionary) {
        var dict = this.o.dictionary.subarray(-32768);
        this.b.set(dict, 32768 - dict.length);
        this.s.i = 32768 - dict.length;
      }
    }
    Deflate2.prototype.p = function(c, f) {
      this.ondata(dopt(c, this.o, 0, 0, this.s), f);
    };
    Deflate2.prototype.push = function(chunk, final) {
      if (!this.ondata)
        err(5);
      if (this.s.l)
        err(4);
      var endLen = chunk.length + this.s.z;
      if (endLen > this.b.length) {
        if (endLen > 2 * this.b.length - 32768) {
          var newBuf = new u8(endLen & -32768);
          newBuf.set(this.b.subarray(0, this.s.z));
          this.b = newBuf;
        }
        var split = this.b.length - this.s.z;
        this.b.set(chunk.subarray(0, split), this.s.z);
        this.s.z = this.b.length;
        this.p(this.b, false);
        this.b.set(this.b.subarray(-32768));
        this.b.set(chunk.subarray(split), 32768);
        this.s.z = chunk.length - split + 32768;
        this.s.i = 32766, this.s.w = 32768;
      } else {
        this.b.set(chunk, this.s.z);
        this.s.z += chunk.length;
      }
      this.s.l = final & 1;
      if (this.s.z > this.s.w + 8191 || final) {
        this.p(this.b, final || false);
        this.s.w = this.s.i, this.s.i -= 2;
      }
    };
    Deflate2.prototype.flush = function() {
      if (!this.ondata)
        err(5);
      if (this.s.l)
        err(4);
      this.p(this.b, false);
      this.s.w = this.s.i, this.s.i -= 2;
    };
    return Deflate2;
  })();
  var Zlib = /* @__PURE__ */ (function() {
    function Zlib2(opts, cb) {
      this.c = adler();
      this.v = 1;
      Deflate.call(this, opts, cb);
    }
    Zlib2.prototype.push = function(chunk, final) {
      this.c.p(chunk);
      Deflate.prototype.push.call(this, chunk, final);
    };
    Zlib2.prototype.p = function(c, f) {
      var raw = dopt(c, this.o, this.v && (this.o.dictionary ? 6 : 2), f && 4, this.s);
      if (this.v)
        zlh(raw, this.o), this.v = 0;
      if (f)
        wbytes(raw, raw.length - 4, this.c.d());
      this.ondata(raw, f);
    };
    Zlib2.prototype.flush = function() {
      Deflate.prototype.flush.call(this);
    };
    return Zlib2;
  })();
  var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
  var tds = 0;
  try {
    td.decode(et, { stream: true });
    tds = 1;
  } catch (e) {
  }

  // client/long-image.mjs
  var DEFAULT_FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  var COLORS = { text: "#25242c", muted: "#777180", purple: "#7962ad", line: "#ebe7f1", paper: "#ffffff", note: "#faf8fd" };
  var MAX_BYTES = 25 * 1024 * 1024;
  var text = (value) => value == null ? "" : String(value);
  var list = (value) => Array.isArray(value) ? value : [];
  var validColor = (value, fallback) => /^#[\da-f]{6}$/i.test(value || "") ? value : fallback;
  var LongImageError = class extends Error {
    constructor(code, message, detail) {
      super(message);
      this.name = "LongImageError";
      this.code = code;
      if (detail !== void 0) this.detail = detail;
    }
  };
  function aborted(signal) {
    if (signal?.aborted) throw new LongImageError("ABORTED", "\u5DF2\u53D6\u6D88\u957F\u56FE\u751F\u6210\u3002");
  }
  function canvasFactory(options) {
    if (typeof options.createCanvas === "function") return options.createCanvas;
    if (typeof OffscreenCanvas === "function") return (width, height) => new OffscreenCanvas(width, height);
    if (typeof document !== "undefined") return (width, height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    };
    throw new LongImageError("CANVAS_UNAVAILABLE", "\u6B64\u8BBE\u5907\u65E0\u6CD5\u751F\u6210\u56FE\u7247\uFF0C\u8BF7\u6362\u7528\u652F\u6301 Canvas \u7684\u6D4F\u89C8\u5668\u3002");
  }
  function contextFor(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new LongImageError("CANVAS_UNAVAILABLE", "\u65E0\u6CD5\u5EFA\u7ACB\u56FE\u7247\u753B\u5E03\uFF0C\u8BF7\u5173\u95ED\u5176\u4ED6\u6807\u7B7E\u9875\u540E\u91CD\u8BD5\u3002");
    return ctx;
  }
  function font(style, size, family) {
    const kind = style.font || "normal";
    return `${kind.includes("italic") ? "italic " : ""}${kind.includes("bold") ? "700 " : "400 "}${size}px ${family}`;
  }
  var segmenter;
  function graphemes(value) {
    if (typeof Intl?.Segmenter === "function") {
      segmenter ||= new Intl.Segmenter("zh", { granularity: "grapheme" });
      return Array.from(segmenter.segment(value), (entry) => ({ text: entry.segment, index: entry.index }));
    }
    const result = [];
    let index = 0, joinNext = false, regionalCount = 0;
    for (const char of Array.from(value)) {
      const modifier = /[\p{Mark}\uFE0E\uFE0F\u200D\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/u.test(char);
      const regional = /[\u{1F1E6}-\u{1F1FF}]/u.test(char);
      if (result.length && (modifier || joinNext || regional && regionalCount % 2)) result[result.length - 1].text += char;
      else result.push({ text: char, index });
      joinNext = char === "\u200D";
      regionalCount = regional ? regionalCount + 1 : 0;
      index += char.length;
    }
    return result;
  }
  function fieldRuns(value, item, field, options, base) {
    const source = text(value);
    if (!source) return [];
    const direct = item?.styledRuns?.[field];
    const tokenizer = options.textTokens || globalThis.TextStyling?.tokens;
    const context = { title: item?.title, tags: item?.tags, context: [item?.caption || item?.desc, item?.body, item?.notes].filter(Boolean).join("\n\n") };
    const raw = direct || (typeof tokenizer === "function" ? tokenizer(source, item?.textStyle, context) : [{ text: source }]);
    if (!Array.isArray(raw) || raw.map((run) => text(run?.text)).join("") !== source) throw new LongImageError("TEXT_STYLE_INVALID", "\u6B63\u6587\u5F3A\u8C03\u6570\u636E\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u5DF2\u4FDD\u5B58\u5185\u5BB9\u540E\u751F\u6210\u3002");
    return raw.map((run) => ({ text: text(run.text), color: validColor(run.color, base.color), font: ["normal", "bold", "italic", "underline", "bold-italic"].includes(run.font) ? run.font : base.font }));
  }
  function wrap(ctx, runs, maxWidth, size, family) {
    const source = runs.map((run) => run.text).join(""), ranges = [];
    let offset = 0;
    for (const run of runs) {
      ranges.push({ ...run, start: offset, end: offset + run.text.length });
      offset += run.text.length;
    }
    const lines = [], current = [];
    let width = 0, rangeIndex = 0;
    const flush = () => {
      lines.push({ units: current.splice(0), width });
      width = 0;
    };
    for (const part of graphemes(source)) {
      while (rangeIndex < ranges.length - 1 && part.index >= ranges[rangeIndex].end) rangeIndex++;
      const style = ranges[rangeIndex] || { color: COLORS.text, font: "normal" };
      if (part.text === "\n" || part.text === "\r\n" || part.text === "\r") {
        flush();
        continue;
      }
      const value = part.text === "	" ? "    " : part.text;
      ctx.font = font(style, size, family);
      const measured = ctx.measureText(value).width;
      if (measured > maxWidth) throw new LongImageError("TEXT_TOO_WIDE", "\u6709\u5355\u4E2A\u6587\u5B57\u6216\u7B26\u53F7\u8D85\u8FC7\u957F\u56FE\u5BBD\u5EA6\uFF0C\u8BF7\u589E\u52A0\u56FE\u7247\u5BBD\u5EA6\u540E\u91CD\u8BD5\u3002");
      if (current.length && width + measured > maxWidth) flush();
      current.push({ text: value, width: measured, color: style.color, font: style.font });
      width += measured;
    }
    if (current.length || source.endsWith("\n") || source.endsWith("\r")) flush();
    return lines;
  }
  async function defaultLoadImage(url, options) {
    let parsed;
    try {
      parsed = new URL(url, typeof location !== "undefined" ? location.href : void 0);
    } catch {
      throw new Error("\u5C01\u9762\u5730\u5740\u65E0\u6548");
    }
    if (!["http:", "https:", "blob:"].includes(parsed.protocol)) throw new Error("\u5C01\u9762\u5730\u5740\u7C7B\u578B\u4E0D\u53D7\u652F\u6301");
    const response = await fetch(parsed.href, { credentials: "same-origin", signal: options.signal });
    if (!response.ok) throw new Error(`\u5C01\u9762\u8BFB\u53D6\u5931\u8D25 (${response.status})`);
    const blob = await response.blob();
    if (typeof createImageBitmap === "function") return createImageBitmap(blob);
    if (typeof Image === "undefined") throw new Error("\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u56FE\u7247\u89E3\u7801");
    const temporaryUrl = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("\u5C01\u9762\u56FE\u7247\u65E0\u6CD5\u89E3\u7801"));
        image.src = temporaryUrl;
      });
    } finally {
      URL.revokeObjectURL(temporaryUrl);
    }
  }
  function dimensions(image) {
    const value = image?.image || image;
    return { image: value, width: Number(image?.width || value?.naturalWidth || value?.width), height: Number(image?.height || value?.naturalHeight || value?.height), release: image?.release };
  }
  var CRC_TABLE = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 3988292384 ^ value >>> 1 : value >>> 1;
    CRC_TABLE[index] = value >>> 0;
  }
  function pngChunk(type, data) {
    const bytes = new Uint8Array(data.length + 12), view = new DataView(bytes.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) bytes[4 + i] = type.charCodeAt(i);
    bytes.set(data, 8);
    let crc = 4294967295;
    for (let i = 4; i < bytes.length - 4; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ crc >>> 8;
    view.setUint32(bytes.length - 4, (crc ^ 4294967295) >>> 0);
    return bytes;
  }
  async function renderLongImage(source, options = {}) {
    if (!source || typeof source !== "object" || !Array.isArray(source.items)) throw new LongImageError("SOURCE_INVALID", "\u8BF7\u5148\u9009\u62E9\u4E00\u6761\u5185\u5BB9\u6216\u4E00\u671F\u5468\u520A\u3002");
    const width = Number(options.width ?? 1e3), stripHeight = Number(options.stripHeight ?? 1024), maxBytes = Number(options.maxBytes ?? MAX_BYTES);
    if (!Number.isInteger(width) || width < 480 || width > 2048) throw new LongImageError("WIDTH_INVALID", "\u957F\u56FE\u5BBD\u5EA6\u987B\u4E3A 480 \u81F3 2048 \u50CF\u7D20\u3002");
    if (!Number.isInteger(stripHeight) || stripHeight < 64 || stripHeight > 2048) throw new LongImageError("STRIP_INVALID", "\u957F\u56FE\u5206\u6BB5\u9AD8\u5EA6\u987B\u4E3A 64 \u81F3 2048 \u50CF\u7D20\u3002");
    if (!Number.isInteger(maxBytes) || maxBytes < 100 || maxBytes > MAX_BYTES) throw new LongImageError("SIZE_INVALID", "\u957F\u56FE\u6587\u4EF6\u4E0A\u9650\u4E0D\u80FD\u8D85\u8FC7 25 MB\u3002");
    aborted(options.signal);
    if (typeof document !== "undefined" && document.fonts?.ready) await document.fonts.ready;
    const makeCanvas = canvasFactory(options), measuring = makeCanvas(width, 1), measure = contextFor(measuring), family = options.fontFamily || DEFAULT_FONT;
    const scale = width / 1e3, left = Math.round(72 * scale), available = width - left * 2, ops = [], loaded = [];
    const stats = { items: source.items.length, textCharacters: 0, textLines: 0, imagesRequested: 0, imagesRendered: 0, missingImages: [], strips: 0, maxCanvasHeight: 0, truncated: false };
    let y = Math.round(64 * scale);
    const gap = (amount) => {
      y += Math.round(amount * scale);
    };
    const addText = (value, item, field, { size = 26, color = COLORS.text, weight = "normal", inset = 0, lineRatio = 1.65, prefix = "" } = {}) => {
      const literal = text(value);
      if (!literal) return;
      const fontSize = size * scale, lineHeight = Math.ceil(fontSize * lineRatio);
      const runs = fieldRuns(literal, item, field, options, { color, font: weight });
      if (prefix) runs.unshift({ text: prefix, color, font: weight });
      const lines = wrap(measure, runs, available - inset * 2, fontSize, family);
      stats.textCharacters += literal.length + prefix.length;
      stats.textLines += lines.length;
      for (const line of lines) {
        ops.push({ type: "text", y, height: lineHeight, x: left + inset, size: fontSize, line });
        y += lineHeight;
      }
    };
    const addImage = async (url, item, index) => {
      if (!url) return;
      aborted(options.signal);
      stats.imagesRequested++;
      let resolved;
      try {
        resolved = dimensions(await (options.loadImage ? options.loadImage(text(url), item, index) : defaultLoadImage(text(url), options)));
        if (!resolved.image || !Number.isFinite(resolved.width) || !Number.isFinite(resolved.height) || resolved.width <= 0 || resolved.height <= 0) throw new Error("\u5C01\u9762\u5C3A\u5BF8\u65E0\u6548");
        const drawWidth = Math.min(available, resolved.width / resolved.height < 0.9 ? 560 * scale : available);
        const drawHeight = Math.ceil(drawWidth * resolved.height / resolved.width);
        if (!Number.isSafeInteger(drawHeight) || drawHeight > 2147483647) throw new Error("\u5C01\u9762\u5C3A\u5BF8\u8FC7\u5927");
        ops.push({ type: "image", y, height: drawHeight, x: Math.round((width - drawWidth) / 2), width: drawWidth, image: resolved.image });
        loaded.push(resolved);
        stats.imagesRendered++;
        y += drawHeight;
        gap(28);
      } catch (error) {
        if (resolved?.release) resolved.release();
        else resolved?.image?.close?.();
        aborted(options.signal);
        if (!options.allowMissingImages) throw new LongImageError("IMAGE_UNAVAILABLE", `\u7B2C ${index < 0 ? "\u5C01\u9762" : index + 1} \u6761\u56FE\u7247\u65E0\u6CD5\u8BFB\u53D6\uFF0C\u8BF7\u91CD\u8BD5\u6216\u66FF\u6362\u5C01\u9762\u540E\u518D\u751F\u6210\u3002`, { index, message: text(error?.message) });
        stats.missingImages.push({ index, message: text(error?.message) });
        addText("\u5C01\u9762\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6", {}, "message", { size: 22, color: COLORS.muted });
        gap(18);
      }
    };
    try {
      options.onProgress?.({ stage: "layout", value: 0 });
      addText(options.brandLabel || "\u7075\u611F\u5E93 \xB7 \u5B8C\u6574\u5185\u5BB9\u5907\u4EFD", {}, "brand", { size: 20, color: COLORS.purple });
      gap(22);
      addText(source.title || "\u672A\u547D\u540D\u5185\u5BB9", source, "title", { size: 44, weight: "bold", lineRatio: 1.4 });
      gap(20);
      const meta = [source.date, `${source.items.length} \u6761\u5185\u5BB9`].filter(Boolean).join("  \xB7  ");
      addText(meta, {}, "meta", { size: 20, color: COLORS.muted });
      gap(28);
      if (source.coverUrl) await addImage(source.coverUrl, source, -1);
      if (source.intro) {
        addText(source.intro, source, "intro", { size: 28 });
        gap(36);
      }
      ops.push({ type: "line", y, height: 2, x: left, width: available });
      gap(36);
      for (const [index, raw] of source.items.entries()) {
        aborted(options.signal);
        const item = raw && typeof raw === "object" ? raw : { title: text(raw) };
        const tags = list(item.tags).map((tag) => `# ${text(tag)}`).join("  ");
        addText([item.sourceLabel || item.platform || "\u4E2A\u4EBA\u8BB0\u5F55", tags].filter(Boolean).join("  \xB7  "), {}, "meta", { size: 20, color: COLORS.purple });
        gap(14);
        addText(item.title || "\u672A\u547D\u540D\u5185\u5BB9", item, "title", { size: 34, weight: "bold", lineRatio: 1.45, prefix: `${item.sequence || index + 1}. ` });
        gap(14);
        const rating = Number(item.rating);
        if (rating >= 1 && rating <= 5) {
          addText("\u2605".repeat(Math.floor(rating)), {}, "rating", { size: 23, color: COLORS.purple });
          gap(12);
        }
        if (item.url) {
          addText(item.url, {}, "url", { size: 20, color: COLORS.purple });
          gap(18);
        }
        const caption = text(item.caption || item.desc);
        if (caption) {
          addText(caption, item, "caption", { size: 26 });
          gap(24);
        }
        await addImage(item.coverUrl, item, index);
        if (item.body && text(item.body) !== caption) {
          addText("\u6211\u7684\u7B14\u8BB0", {}, "label", { size: 21, color: COLORS.muted });
          gap(10);
          addText(item.body, item, "body", { size: 26 });
          gap(24);
        }
        if (item.notes && text(item.notes) !== text(item.body)) {
          addText("\u8865\u5145\u8BB0\u5F55", {}, "label", { size: 21, color: COLORS.muted });
          gap(10);
          addText(Array.isArray(item.notes) ? item.notes.map(text).join("\n") : item.notes, item, "notes", { size: 26 });
          gap(24);
        }
        for (const bullet of list(item.bullets)) {
          addText(`\u2022 ${text(bullet)}`, item, "bullet", { size: 26 });
          gap(6);
        }
        gap(28);
        ops.push({ type: "line", y, height: 2, x: left, width: available });
        gap(36);
        options.onProgress?.({ stage: "layout", value: (index + 1) / Math.max(source.items.length, 1) });
      }
      addText(`\u5DF2\u5230\u672C\u9875\u672B\u5C3E \xB7 ${source.items.length} \u6761\u5185\u5BB9`, {}, "end", { size: 20, color: COLORS.muted });
      gap(60);
      const height = Math.ceil(y);
      if (!Number.isSafeInteger(height) || height <= 0 || height > 2147483647) throw new LongImageError("HEIGHT_INVALID", "\u5185\u5BB9\u8D85\u8FC7 PNG \u957F\u56FE\u7684\u6700\u5927\u9AD8\u5EA6\uFF0C\u8BF7\u6309\u5468\u520A\u5206\u671F\u5907\u4EFD\u3002");
      if (width * height > Math.min(1e8, Number(options.maxPixels) || 1e8)) throw new LongImageError("PIXEL_LIMIT", "\u5185\u5BB9\u8D85\u8FC7\u5355\u5F20\u957F\u56FE\u7684\u4FDD\u5B58\u5BB9\u91CF\uFF0C\u8BF7\u6309\u5468\u520A\u5206\u671F\u5907\u4EFD\uFF1B\u539F\u6587\u4ECD\u5B8C\u6574\u4FDD\u7559\u3002");
      const header = new Uint8Array(13), view = new DataView(header.buffer);
      view.setUint32(0, width);
      view.setUint32(4, height);
      header[8] = 8;
      header[9] = 6;
      const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", header)];
      let bytes = parts.reduce((count, part) => count + part.length, 0);
      const compressor = new Zlib({ level: options.compressionLevel ?? 6 }, (data) => {
        if (!data.length) return;
        const part = pngChunk("IDAT", data);
        bytes += part.length;
        if (bytes + 12 > maxBytes) throw new LongImageError("FILE_TOO_LARGE", "\u5B8C\u6574\u957F\u56FE\u8D85\u8FC7 25 MB\uFF0C\u5C1A\u672A\u4FDD\u5B58\uFF1B\u8BF7\u51CF\u5C11\u672C\u671F\u5185\u5BB9\u6216\u964D\u4F4E\u56FE\u7247\u5BBD\u5EA6\u540E\u91CD\u8BD5\u3002", { maxBytes });
        parts.push(part);
      });
      const stripCanvas = makeCanvas(width, Math.min(stripHeight, height));
      let ctx = contextFor(stripCanvas), first = 0;
      const pause = options.yieldControl || (() => new Promise((resolve) => setTimeout(resolve, 0)));
      for (let top = 0; top < height; top += stripHeight) {
        aborted(options.signal);
        const currentHeight = Math.min(stripHeight, height - top);
        if (stripCanvas.height !== currentHeight) {
          stripCanvas.height = currentHeight;
          ctx = contextFor(stripCanvas);
        }
        ctx.fillStyle = COLORS.paper;
        ctx.fillRect(0, 0, width, currentHeight);
        ctx.textBaseline = "alphabetic";
        while (first < ops.length && ops[first].y + ops[first].height < top) first++;
        for (let index = first; index < ops.length && ops[index].y < top + currentHeight; index++) {
          const op = ops[index], localY = op.y - top;
          if (op.type === "line") {
            ctx.fillStyle = COLORS.line;
            ctx.fillRect(op.x, localY, op.width, 1);
          } else if (op.type === "image") ctx.drawImage(op.image, op.x, localY, op.width, op.height);
          else {
            let x = op.x, run = null;
            const paintRun = () => {
              if (!run) return;
              ctx.fillStyle = run.color;
              ctx.font = font(run, op.size, family);
              ctx.fillText(run.text, run.x, localY + op.size);
              if (run.font === "underline") ctx.fillRect(run.x, localY + op.size + 3 * scale, run.width, Math.max(1, scale));
            };
            for (const unit of op.line.units) {
              if (!run || unit.color !== run.color || unit.font !== run.font) {
                paintRun();
                run = { ...unit, text: "", width: 0, x };
              }
              run.text += unit.text;
              run.width += unit.width;
              x += unit.width;
            }
            paintRun();
          }
        }
        let pixels;
        try {
          pixels = ctx.getImageData(0, 0, width, currentHeight).data;
        } catch (error) {
          throw new LongImageError("PIXELS_UNAVAILABLE", "\u5C01\u9762\u56FE\u7247\u4E0D\u5141\u8BB8\u5BFC\u51FA\uFF0C\u957F\u56FE\u5C1A\u672A\u4FDD\u5B58\uFF1B\u8BF7\u4E0A\u4F20\u672C\u5730\u5C01\u9762\u6216\u91CD\u8BD5\u3002", { message: text(error?.message) });
        }
        const rowBytes = width * 4, scanlines = new Uint8Array((rowBytes + 1) * currentHeight);
        for (let row = 0; row < currentHeight; row++) scanlines.set(pixels.subarray(row * rowBytes, (row + 1) * rowBytes), row * (rowBytes + 1) + 1);
        compressor.push(scanlines, false);
        stats.strips++;
        stats.maxCanvasHeight = Math.max(stats.maxCanvasHeight, currentHeight);
        options.onProgress?.({ stage: "render", value: (top + currentHeight) / height, width, height });
        await pause();
      }
      compressor.push(new Uint8Array(0), true);
      parts.push(pngChunk("IEND", new Uint8Array(0)));
      const blob = new Blob(parts, { type: "image/png" });
      stats.bytes = blob.size;
      stats.width = width;
      stats.height = height;
      options.onProgress?.({ stage: "complete", value: 1, width, height, bytes: blob.size });
      return { blob, width, height, stats };
    } finally {
      for (const resolved of loaded) {
        if (typeof resolved.release === "function") resolved.release();
        else resolved.image?.close?.();
      }
    }
  }
  return __toCommonJS(long_image_exports);
})();
