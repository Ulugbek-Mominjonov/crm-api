import { plainToInstance, Type } from 'class-transformer'
import { IsInt, Matches, Min, ValidateNested, validate } from 'class-validator'
import { flattenValidationErrors } from './validation-errors'

class Item {
  @IsInt()
  @Min(1)
  qty!: number
}

class Body {
  @Matches(/^#[0-9A-F]{6}$/, { message: 'brandColor — #RRGGBB' })
  brandColor!: string

  @ValidateNested({ each: true })
  @Type(() => Item)
  items!: Item[]
}

describe('flattenValidationErrors', () => {
  it('har xato — maydon yo‘li bilan; ichki maydon xabari Nest’dagidek yo‘l prefiksi bilan', async () => {
    const errors = await validate(plainToInstance(Body, { brandColor: 'red', items: [{ qty: 2 }, { qty: 0 }] }))
    expect(flattenValidationErrors(errors)).toEqual([
      { field: 'brandColor', message: 'brandColor — #RRGGBB' },
      { field: 'items[1].qty', message: 'items.1.qty must not be less than 1' },
    ])
  })
})
