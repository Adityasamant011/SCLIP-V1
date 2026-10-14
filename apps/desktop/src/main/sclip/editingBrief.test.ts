import {describe,it,expect} from 'vitest'
import {explicitOutputDuration,SubmittedPrompt,currentOutput} from './editingBrief'
import {blankProject} from '../state/model'
import {uuidV7Gen} from '../state/ids'

describe('explicit output requirements, without editorial decisions',()=>{
 it('recognizes output duration while ignoring available source and gap lengths',()=>{
  expect(explicitOutputDuration('Use the imported tutorial footage to make a coherent 20-second excerpt.')?.target_us).toBe(20000000)
  expect(explicitOutputDuration('Make a roughly 30-second product highlight from the imported demo.')?.tolerance_us).toBe(3000000)
  expect(explicitOutputDuration('Make a roughly 30-second Motorola Razr product highlight from the imported demo.')?.target_us).toBe(30000000)
  expect(explicitOutputDuration('Make a 20-second gap in the video.')).toBeUndefined()
  expect(explicitOutputDuration('Make a five-second transition in the video.')).toBeUndefined()
  expect(explicitOutputDuration('There is a five-second gap; close it.')).toBeUndefined()
  expect(explicitOutputDuration('The source is a 600-second video.')).toBeUndefined()
  expect(explicitOutputDuration('Make a 20-second excerpt. Make a 30-second highlight.')).toBeUndefined()
 })
 it('reports actual empty/long timeline as unmet without generating cuts',()=>{
  const project=blankProject(uuidV7Gen(),'synthetic')
  const requirement=explicitOutputDuration('Create a 20-second cut.')!
  expect(currentOutput(project,requirement).duration_requirement?.met).toBe(false)
  project.compositions[project.root_id].duration_us=575_700_000
  expect(currentOutput(project,requirement).duration_requirement?.actual_us).toBe(575_700_000)
  expect(currentOutput(project,requirement).duration_requirement?.met).toBe(false)
  project.compositions[project.root_id].duration_us=20_000_000
  expect(currentOutput(project,requirement).duration_requirement?.met).toBe(true)
  expect(currentOutput(project,requirement).duration_seconds).toBe(20)
  expect(currentOutput(project,explicitOutputDuration('Make a roughly 20-second video.')).duration_requirement?.allowed_range_seconds).toEqual([18,22])
 })
 it('collects typed/pasted submissions, backspace and cancellation; declines unsupported cursor editing',()=>{
  const prompt=new SubmittedPrompt()
  expect(prompt.feed('Make a 20-second cut')).toEqual([])
  expect(prompt.feed('\r')).toEqual(['Make a 20-second cut'])
  expect(prompt.feed('\x1b[200~Create a 30-second highlight.\x1b[201~\r')).toEqual(['Create a 30-second highlight.'])
  expect(prompt.feed('\x1b[200~Make a 20-second cut.\nUse a clean ending.')).toEqual([])
  expect(prompt.feed('\x1b[201~')).toEqual([])
  expect(prompt.feed('\r')).toEqual(['Make a 20-second cut.\nUse a clean ending.'])
  expect(prompt.feed('blueX\x7f\r')).toEqual(['blue'])
  expect(prompt.feed('discard\x03\r')).toEqual([])
  expect(prompt.feed('text\x1b[D\r')).toEqual([null])
 })
})
