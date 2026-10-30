// Rebuild the embedded, self-contained contour worker from the split sources.
//
// scripts/build-client.js moved this block out of client.js: the generated source
// now lives in its own fragment (src/client/21-contour-worker.embed.js), and the
// kernel functions it embeds are extracted from src/client/20-contour.js. The
// equality gate therefore covers that fragment instead of client.js.
const fs=require('fs'),path=require('path'),vm=require('vm')
const root=path.resolve(__dirname,'..')
const kernelFile=path.join(root,'src/client/20-contour.js')
const embedFile=path.join(root,'src/client/21-contour-worker.embed.js')
let source=fs.readFileSync(kernelFile,'utf8').replace(/\r\n/g,'\n')
function grab(name) {
  const start=source.indexOf('const '+name+' = ')
  if(start<0)throw Error('Missing kernel function '+name+' in src/client/20-contour.js')
  let depth=0
  for(let i=source.indexOf('{',start);i<source.length;i++){
    if(source[i]==='{')depth++
    if(source[i]==='}' && --depth===0)return source.slice(start,i+1)
  }
  throw Error('Unbalanced kernel '+name)
}
/* The kernel list must track src/client/20-contour.js: `contourStepFor` joined it
   when the grid gained a cell cap (contourBuild reads it), and the constants it
   and the kernel close over live in src/contour/contour-worker.js because this script only
   extracts FUNCTIONS — a missing one is a ReferenceError inside the worker at runtime.
   `contourOverlayTrail` is extracted for the same reason: contourExtract calls it
   whenever a frame carries trail samples, so the first Worker renderer that
   forwards the (documented, not-yet-wired) trail input would otherwise die on a
   ReferenceError instead of drawing. */
const names=['contourRng','contourStepFor','contourOverlayTrail','contourBuild','contourBuildCandidate','contourCoverageScore',
  'contourEvaluate','contourExtractLevel','contourExtract','contourDrawLines']
let worker=fs.readFileSync(path.join(root,'src/contour/contour-worker.js'),'utf8')
/* The replacement is passed as a FUNCTION: with a string replacement,
   String.replace interprets $&, $', $` and $1..$99 inside the inserted source,
   and the kernel/webgl source is arbitrary future code — a `[class$='_frame']`
   selector in a comment would silently splice the tail of the worker file into
   the bundle, and the byte-equality gates would stay green while shipping it. */
worker=worker.replace('/* CONTOUR_KERNEL */',()=>names.map(grab).join('\n'))
worker=worker.replace('/* CONTOUR_WEBGL */',()=>fs.readFileSync(path.join(root,'src/contour/contour-webgl.js'),'utf8'))
// The artifact must be byte-stable across checkouts: JSON.stringify preserves raw
// \r\n, so a CRLF working tree would bake \r into the embedded string and a
// normalized LF copy of the same sources would rebuild to a different blob —
// failing the equality gate on a copy that is not stale. LF is also what the
// runtime Blob worker expects.
worker=worker.replace(/\r\n/g,'\n')
new vm.Script(worker)
const head='    /* BEGIN GENERATED CONTOUR WORKER */'
const tail='    /* END GENERATED CONTOUR WORKER */'
// The equality test below is byte-for-byte, so the separators this writes have to
// be the checkout's own: a CRLF working tree (core.autocrlf on Windows) joined with
// '\n' would leave the gate failing on a copy that is not stale.
const nl=fs.existsSync(embedFile)&&fs.readFileSync(embedFile,'utf8').includes('\r\n')?'\r\n':'\n'
const next=head+nl+'    const CONTOUR_WORKER_SOURCE = '+JSON.stringify(worker)+nl+tail+nl
if(process.argv.includes('--check')) {
  if(!fs.existsSync(embedFile)||fs.readFileSync(embedFile,'utf8')!==next)throw Error('Embedded worker is stale; run npm run build:worker')
} else fs.writeFileSync(embedFile,next)
console.log('Contour worker verified: '+worker.length+' characters')
