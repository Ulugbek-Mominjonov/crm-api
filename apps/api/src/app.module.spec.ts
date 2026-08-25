import { Test } from '@nestjs/testing'
import { AppModule } from './app.module'

describe('AppModule', () => {
  it('DI konteyneri xatosiz yig‘iladi', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    expect(moduleRef).toBeDefined()
    await moduleRef.close()
  })
})
