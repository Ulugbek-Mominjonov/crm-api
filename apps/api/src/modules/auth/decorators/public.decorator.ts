import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'isPublic'

/**
 * Endpointni autentifikatsiyasiz ochadi.
 *
 * Sukut bo'yicha HAMMA yo'l yopiq (global guard). Ochilishi kerak bo'lgan
 * yo'l ATAYLAB belgilanadi — unutilgan endpoint yopiq qoladi, ochiq emas.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true)
