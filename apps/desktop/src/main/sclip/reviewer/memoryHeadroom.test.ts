import { expect, it } from 'vitest'
import { reportedHeadroom } from './memoryHeadroom'
it('uses only bounded OS memory percentages and never guesses from malformed output',()=>{
 expect(reportedHeadroom('System-wide memory free percentage: 45%', 1000)).toBe(450)
 for(const output of ['unknown','System-wide memory free percentage: 101%','System-wide memory free percentage: -1%']) expect(reportedHeadroom(output,1000)).toBeUndefined()
 expect(reportedHeadroom('System-wide memory free percentage: 0%',1000)).toBe(0)
})
