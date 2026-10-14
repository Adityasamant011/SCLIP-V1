import {test} from 'node:test'
import assert from 'node:assert/strict'
import {assertSystemLibraries} from './stage-whisper-runtime.mjs'
test('portable runtime refuses Homebrew and developer library dependencies',()=>{
 assert.deepEqual(assertSystemLibraries('whisper-cli:\n\t/usr/lib/libc++.1.dylib (current version 1.0.0)\n\t/usr/lib/libSystem.B.dylib (current version 1.0.0)'),['/usr/lib/libc++.1.dylib','/usr/lib/libSystem.B.dylib'])
 for(const dependency of ['/opt/homebrew/lib/libggml.dylib','/developer/lib/libggml.dylib','@rpath/libggml.dylib'])assert.throws(()=>assertSystemLibraries(`whisper-cli:\n\t${dependency} (current version 1.0.0)`),/external runtime/)
})
