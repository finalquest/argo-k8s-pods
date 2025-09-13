import { When, Then, setDefaultTimeout } from '@wdio/cucumber-framework';
import { browser, driver } from '@wdio/globals';
import { FindElement } from '../../helpers/ClassFactory';
import { Gestures } from '../../helpers/Gestures';
import { keyPress, tapElementByPositionOCR, asyncForEach } from '../../helpers/utils';
import { World } from './World';
import allureReporter from '@wdio/allure-reporter';
import assert from 'assert';
const { addStep } = allureReporter;

const BACK_WAITING_TIME = 1000;
const SHARE_RENDERING_WAITING_TIME = 2000;

//Begin set values
When('enter saved passcode', async () => {
  const arr = World.passcode.split('');
  await asyncForEach(arr, async (num) => {
    if (driver.isAndroid == true) {
      await (await $(`//*[@text='${num}']`)).click();
    } else {
      await (await $(`~Teclado Clave Tecla ${num}`)).click();
    }
  });
});

When('user clear field {string}', async (field) => {
  const element = FindElement(field);
  await (await element).clearValue();
});

When('user types {string} on field {string}', async (string, selector) => {
  const element = FindElement(selector);
  await (await element).click();
  await (await element).setValue(string);
});

When(' number {int} on field {string}', async (number, selector) => {
  const element = FindElement(selector);
  await (await element).click();
  await (await element).addValue(number);
  await browser.pause(1500);
});

When('user types {int} on field {string} and click on {string}', async (number, selector, ele) => {
  const element = FindElement(selector);
  const element2 = FindElement(ele);
  await (await element).click();
  await (await element).addValue(number);
  await (await element2).click();
});

When('user types {string} on field {string} and press Enter', async (string, selector) => {
  const element = FindElement(selector);
  await (await element).click();
  await (await element).setValue(string);
});

When('user types {string} on field {string} and press Esc', async (string, selector) => {
  const element = FindElement(selector);
  await (await element).click();
  await (await element).setValue(string);
  await driver.keys(['Esc']);
});

When('user types {string} on field {string} and press TabEnter', async (string, selector) => {
  const element = FindElement(selector);
  await (await element).click();
  await (await element).addValue(string);
  await browser.pause(1500);
  await driver.keys(['Tab']);
  await driver.keys(['Enter']);
});

When('user types {string} on field {string} and press double Enter', async (string, selector) => {
  const element = FindElement(selector);
  await (await element).click();
  await (await element).addValue(string);
  await browser.pause(1500);
  await driver.keys(['Enter']);
  await driver.keys(['Enter']);
});

When('user set {string} on field {string}', async (amount, selector) => {
  const element = FindElement(selector);
  if (driver.isAndroid === true) {
    await (await element).click();
    for (const number of amount.split('')) {
      await keyPress(number);
      World.amount = amount;
    }
  } else {
    try {
      for (const number of amount.split('')) {
        await (await $(`~${number}`)).click();
        World.amount = amount;
      }
    } catch (error) {
      await (await element).click();
      for (const number of amount.split('')) {
        await (await $(`~${number}`)).click();
        World.amount = amount;
      }
    }
  }
});

//Begin swipe and scroll

When('user scroll to see element {string}', async (string) => {
  let selector = await FindElement(string);
  let element = $(selector);
  await element.scrollIntoView();
});

When('optional user scrolls down to see {string}', async (el) => {
  if (!World.optionalBlock) return; // se saltea sin fallar
  const element = await FindElement(el);
  await Gestures.checkIfDisplayedWithScrollDown(await element, 5);
});

When('user scrolls down to see {string}', async (selector) => {
  const element = await FindElement(selector);
  await Gestures.checkIfDisplayedWithScrollDown(await element, 5);
});

When('user scrolls down to see and click on {string}', async (selector) => {
  const element = await FindElement(selector);
  await Gestures.checkIfDisplayedWithScrollDown(await element, 10);
  await browser.pause(1400);
  await element.click();
});

When('user scrolls down to see and double click on {string}', async (selector) => {
  const element = FindElement(selector);
  await Gestures.checkIfDisplayedWithScrollDown(await element, 10);
  await browser.pause(1000);
  await element.doubleClick();
});

When('user scrolls up to see {string}', async (selector) => {
  const element = FindElement(selector);
  await Gestures.checkIfDisplayedWithScrollUp(await element, 10);
});

When('user scrolls up {int} percent until see {string}', async (percentage, selector) => {
  const element = FindElement(selector);
  await Gestures.swipeUpPassingPercentageUntilSeeElement(element, percentage / 100);
});

When('user scrolls to left to see {string}', async (selector) => {
  const element = FindElement(selector);
  await Gestures.checkIfDisplayedWithScrollLeft(await element, 10);
});

When('user scrolls to rigth to see {string}', async (selector) => {
  const element = FindElement(selector);
  await Gestures.checkIfDisplayedWithScrollRight(await element, 10);
});

When('user swipe rigth', async () => {
  await Gestures.swipeRight();
});

When('user swipe left', async () => {
  await Gestures.swipeLeft();
});

When('user swipe down', async () => {
  await Gestures.swipeDown();
});

When('user swipe up', async () => {
  await Gestures.swipeUp();
});

When('user double swipe up', async () => {
  await Gestures.swipeUp();
  await Gestures.swipeUp();
});

When('swipe up {int} percentage', async (percentage) => {
  var p = percentage / 100;
  await Gestures.swipeUp(p);
});

When('user swipes to the left from element {string}', async (selector) => {
  const element = FindElement(selector);
  const locX = (await (await element).getLocation('x')) + 100;
  const locY = (await (await element).getLocation('y')) + 100;

  await driver.touchPerform([
    { action: 'press', options: { x: locX, y: locY } },
    {
      action: 'wait',
      options: { ms: 1000 },
    },
    { action: 'moveTo', options: { x: locX - 100, y: locY } },
    { action: 'release' },
  ]);
});

//END Swipes and scrolls
//Begin tap

When('user tap on {string}', async (text) => {
  const element = await FindElement(text);
  await element.click();
});

/*Se hace doble click en el elemento ya que la lista quedaba por detras y no se veía*/
When('user double tap on {string}', async (screen) => {
  const element = await FindElement(screen);
  await (await element).click();
  await (await element).click();
});

When('user wait to see and click on left {string}', async (screen) => {
  const element = await FindElement(screen);
  await expect(element).toBeDisplayed({
    wait: 90000,
    message: 'No se encontro el elemento o texto user wait to see and click on : ' + element + ' en 90s',
  });
  await browser.pause(500);
  await element.click({ button: 'left' });
});

When('user wait to see and click on {string}', async (screen) => {
  const element = await FindElement(screen);
  await expect(element).toBeDisplayed({
    wait: 90000,
    message: 'No se encontro el elemento o texto user wait to see and click on : ' + element + ' en 90s',
  });
  await expect(element).toBeEnabled({
    timeout: 25000,
    message: 'No se visualiza habilitado el texto : ' + element + ' en 25s',
  });
  await browser.pause(500);
  await await element.click();
});

When('user wait to see 10 seconds and click on {string}', async (screen) => {
  const element = await FindElement(screen, { timeout: 10000 });
  await expect(element).toBeDisplayed({ wait: 5000, message: 'No se pudo hacer click en : ' + element + ' en 10s' });
  await expect(element).toBeEnabled({ timeout: 5000, message: 'No se pudo hacer click en : ' + element + ' en 10s' });
  await browser.pause(1000);
  await await element.click();
});

When('user wait to see and retry click on {string}', async (string) => {
  const element = await FindElement(string);
  await expect(element).toBeDisplayed({
    wait: 40000,
    message: 'No se encontro el elemento o texto user wait to see and click on : ' + element + ' en 40s',
  });
  await expect(element).toBeEnabled({
    timeout: 25000,
    message: 'No se encontro el elemento o texto user wait to see and click on : ' + element + ' en 40s',
  });
  await element.click();
  await browser.pause(1000);
  while (await element.isDisplayed()) {
    try {
      await element.click();
      await browser.pause(2500); // Esperar después del clic
    } catch (error) {
      console.warn(`⚠️ No se pudo hacer click en ${string}, probablemente ya desapareció. Saliendo del bucle.`);
      break;
    }
  }
});

When('user wait to see and retry click on another {string}', async (string) => {
  const element = await FindElement(string);
  await expect(element).toBeDisplayed({
    wait: 40000,
    message: 'No se encontro el elemento o texto user wait to see and click on : ' + element + ' en 40s',
  });
  await expect(element).toBeEnabled({
    timeout: 25000,
    message: 'No se encontro el elemento o texto user wait to see and click on : ' + element + ' en 40s',
  });
  await element.click();
  await browser.pause(1000);
  while (await element.isDisplayed()) {
    try {
      await element.click({ x: 100 });
      await browser.pause(1500); // Esperar después del clic
    } catch (error) {
      console.warn(`⚠️ No se pudo hacer click en ${string}, probablemente ya desapareció. Saliendo del bucle.`);
      break;
    }
  }
});

When('user select about service {string}', async (string) => {
  switch (string) {
    case 'newHealthService': {
      const element = await FindElement('newRecharge.selectAmountHealth');
      await element.click();
      const amount = await FindElement('newRecharge.selectAmountHealth2');
      await amount.click();
      break;
    }

    case 'newServicePrePay': {
      const element = await FindElement('newRecharge.selectAmount');
      await element.click();
      await element.addValue('123');
      break;
    }

    case 'newTransportPublic': {
      const element = await FindElement('newRecharge.selectAmountTrans');
      await element.click();
      const amount = await FindElement('newRecharge.selectAmountTrans');
      await amount.click();
      break;
    }

    case 'newCellphone': {
      const element = await FindElement('newRecharge.selectAmountCell');
      await element.click();
      const amount = await FindElement('newRecharge.selectAmountCell');
      await amount.click();
      break;
    }

    case 'newTCPrepay': {
      const element = await FindElement('newRecharge.selectAmountPrePay');
      await element.click();
      await element.addValue('123');
      break;
    }
  }
});

When('visual snapshot {string}', function (id) {
  World.visualSnapshotId = id; // lo usará el hook AfterStep
});
When('optional user wait to see and click on {string} after to see {string}', async (string, screen) => {
  if (!World.optionalBlock) return; // se saltea sin fallar
  const element = await FindElement(string);
  await expect(element).toBeDisplayed({
    wait: 40000,
    message: 'No se encontro el elemento o texto user wait to see and click on : ' + element + ' en 40s',
  });
  await expect(element).toBeEnabled({
    timeout: 25000,
    message: 'No se encontro el elemento o texto user wait to see and click on : ' + element + ' en 25s',
  });
  await element.click();
  const secondElement = await FindElement(screen);
  await expect(secondElement).toBeDisplayed({ wait: 40000, message: 'No se encontro el segundo elemento' });
});

When('user wait to see and click on {string} after to see {string}', async (string, screen) => {
  const element = await FindElement(string);
  await expect(element).toBeDisplayed({
    wait: 40000,
    message: 'No se encontro el elemento o texto user wait to see and click on : ' + element + ' en 40s',
  });
  await expect(element).toBeEnabled({
    timeout: 25000,
    message: 'No se encontro el elemento o texto user wait to see and click on : ' + element + ' en 25s',
  });
  await element.click();
  const secondElement = await FindElement(screen);
  await expect(secondElement).toBeDisplayed({ wait: 40000, message: 'No se encontro el segundo elemento' });
});

When('user wait to see and retry click on another {string} after to see {string}', async (string, screen) => {
  const element = await FindElement(string);
  await element.click();

  if (await (await FindElement(screen)).isDisplayed({ timeout: 10000 })) {
    console.log('Second element is displayed. Exiting the loop.');
  }
});

When('user wait to see and retry click on {string} after to see {string}', async (string, screen) => {
  const element = await FindElement(string);
  await element.click();

  if (await (await FindElement(screen)).isDisplayed({ timeout: 10000 })) {
    console.log('Second element is displayed. Exiting the loop.');
  }
});

When('user wait to see and retry click on {string} after to be enable {string}', async (string, screen) => {
  const element = await FindElement(string);
  await expect(element).toBeDisplayed({
    wait: 40000,
    message: 'No se encontro el elemento o texto user wait to see and click on : ' + element + ' en 40s',
  });
  const elementScreen = await FindElement(screen);
  await browser.waitUntil(
    async () => {
      if (await elementScreen.isEnabled()) {
        return true;
      }
      await element.click();
      await browser.pause(1000);
      return false;
    },
    {
      timeout: 60000,
      timeoutMsg: `El elemento '${screen}' no se habilitó en 60s`,
    }
  );
});

Then('user wait to see share', async () => {
  // Espera que la actividad actual sea ChooserActivity
  await driver.waitUntil(
    async () => {
      const activity = await driver.getCurrentActivity();
      return activity.includes('ChooserActivity');
    },
    {
      timeout: 5000,
      timeoutMsg: 'No se abrió el share sheet',
    }
  );
  await browser.pause(SHARE_RENDERING_WAITING_TIME);
});

Then('user goes back and see {string}', async (screen) => {
  await browser.pause(BACK_WAITING_TIME);
  await driver.back();

  const element = await FindElement(screen);
  await expect(element).toBeDisplayed({
    wait: 40000,
    message: 'No se encontro el elemento o texto user wait to see and click on : ' + element + ' en 40s',
  });
});

When('user types random text on field {string}', async (selector) => {
  const randomString = Math.random().toString(36).substring(7);
  const element = await FindElement(selector);
  await element.click();
  await element.clear();
  await element.setValue(randomString);
});

When('user wait to see and retry press Back after to see {string}', async (screen) => {
  await browser.waitUntil(
    async () => {
      if (await (await FindElement(screen)).isDisplayed()) {
        return true;
      }
      await driver.back();
      await browser.pause(500);
      return false;
    },
    {
      timeout: 60000,
      timeoutMsg: `El elemento '${screen}' no apareció después de presionar 'back' repetidamente durante 60s`,
    }
  );
});

When('user wait to see and retry Enter and click on {string}', async (string) => {
  const element = await FindElement(string);
  await expect(element).toBeDisplayed({
    wait: 40000,
    message: 'No se encontro el elemento o texto user wait to see and click on : ' + element + ' en 40s',
  });
  await expect(element).toBeEnabled({
    timeout: 25000,
    message: 'No se encontro el elemento o texto user wait to see and click on : ' + element + ' en 25s',
  });
  await browser.waitUntil(
    async () => {
      if (await element.isDisplayed()) {
        await element.click();
        return true;
      }
      await driver.keys(['Enter']);
      await browser.pause(1000);
      return false;
    },
    {
      timeout: 60000,
      timeoutMsg: `No se pudo hacer click en '${string}' después de presionar Enter repetidamente.`,
    }
  );
});

When('user wait to see and double click on {string}', async (screen) => {
  const element = await FindElement(screen);
  await expect(element).toBeDisplayed({
    wait: 90000,
    message: 'No se encontro el elemento o texto : ' + element + ' en la vista en 90s',
  });
  await element.click();
  await element.click();
});

When('user tap on text {string} by OCR', async (text) => {
  await driver.ocrWaitForTextDisplayed(text);
  await tapElementByPositionOCR(text);
});

Then('user tap on {string} after wait {int} seconds', { timeout: 140000 }, async (element, timeout) => {
  const object = await FindElement(element);
  await (
    await object
  ).waitForDisplayed({
    timeout: timeout * 1000,
    reverse: false,
  });
  await (await object).click();
});

Then('user select date', async () => {
  const fechaActual = new Date();
  const dia = fechaActual.getDate();
  const mes = fechaActual.toLocaleString('en-US', { month: 'long' });
  const anio = fechaActual.getFullYear();
  let dateformat = `${dia} ${mes} ${anio}`;

  let date = await $(`//android.view.View[@content-desc="${dateformat}"]`);

  console.log(date, 'asd222');
  await date.click();
});

//END TAPS

//BEGIN MISCE

// When('change wiremock scenario {string} to status {string}', async (scenario, status) => {
//   const statusCode = await changeScenarioStatus(scenario, status);
//   expect(statusCode, 'Ocurrio un error al intentar cambiar del scenario ' + scenario + ' al estado ' + status).to.equal(
//     200
//   );
// });

Then('set {string} on {string}', async (value, screen) => {
  const element = FindElement(screen);
  await (await element).setValue(value);
});

Then('user set key {int}', async (keyCode) => {
  await driver.pressKeyCode(keyCode);
});

When('user press Enter', async () => {
  const isKeyboardHidden = await driver.isKeyboardShown();
  if (isKeyboardHidden) {
    try {
      await driver.hideKeyboard();
    } catch (err) {
      console.error('No se pudo ocultar el teclado:', err.message);
    }
  }
});

When('user press Esc', async () => {
  await driver.keys(['Esc']);
});

When('user press Back', async () => {
  await driver.back();
});

When('user validate if {string} is visible', async (screenIdentifier) => {
  const element = await FindElement(screenIdentifier);

  const exists = await element.isExisting();
  const isVisible = exists ? await element.isDisplayed() : false;

  if (isVisible) {
    const texto = await element.getText().catch(() => screenIdentifier); // por si getText falla
    const errorMessage = `El elemento "${texto}" está visible, pero no debería estarlo.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  } else {
    const successMessage = `Correcto: El elemento "${screenIdentifier}" no está visible, como se esperaba.`;
    console.log(successMessage);
  }
});

Then('user insert password key', async () => {
  await driver.pressKeyCode(8);
  await driver.pressKeyCode(9);
  await driver.pressKeyCode(10);
  await driver.pressKeyCode(11);
  await driver.pressKeyCode(12);
  await driver.pressKeyCode(13);
  await driver.keys(['Enter']);
});

Then('user insert token', async () => {
  const registerDeviceToken = await FindElement('registerDeviceToken.tittle');
  await expect(registerDeviceToken).toBeDisplayed({
    wait: 90000,
    message: 'No se envío el Token/elemento : ' + registerDeviceToken + ' en la vista 90s',
  });
  await driver.pressKeyCode(8);
  await driver.pressKeyCode(9);
  await driver.pressKeyCode(10);
  await driver.pressKeyCode(11);
  await driver.pressKeyCode(12);
  await driver.pressKeyCode(13);
  await driver.keys(['Enter']);
});

Then('user insert password key BPN', async () => {
  const registerDeviceToken = await FindElement('registerDeviceToken.tittle');
  await expect(registerDeviceToken).toBeDisplayed({
    wait: 90000,
    message: 'No se envío el Token/elemento : ' + registerDeviceToken + ' en la vista 90s',
  });
  await driver.pressKeyCode(8);
  await driver.pressKeyCode(9);
  await driver.pressKeyCode(10);
  await driver.pressKeyCode(11);
  await driver.pressKeyCode(12);
  await driver.pressKeyCode(13);
  await driver.pressKeyCode(14);
  await driver.pressKeyCode(15);
  await driver.pressKeyCode(16);
  await driver.keys(['Enter']);
});

//NO FUNCIONA EN IOS
When('user open push notifications', async () => {
  await driver.openNotifications();
});

When('browser is in foreground', async () => {
  const state = await driver.queryAppState('com.android.chrome');
  if (state == 4) {
    console.log('Browser is on Foreground');
  } else {
    throw new Error('Browser is not running in foreground');
  }
});

When('getPageSource {string}', async (time) => {
  if (time == null) {
    await browser.pause(3000);
  } else {
    await browser.pause(time);
  }
  console.log(await driver.getPageSource());
});

When('user toggle airplane mode', async () => {
  await driver.toggleData();
  await driver.toggleWiFi();
});

When('Whatsapp is in foreground', async () => {
  const state = await driver.queryAppState('com.whatsapp');
  if (state == 4) {
    console.log('Whatsapp is on Foreground');
  } else {
    throw new Error('Whatsapp is not running in foreground');
  }
});

When('Store is in foreground', async () => {
  const state = await driver.queryAppState('com.android.vending');
  if (state == 4) {
    console.log('Store is on Foreground');
  } else {
    throw new Error('Store is not running in foreground');
  }
});

When('user wait {int} seconds', async (seconds) => {
  const sec = seconds * 1000;
  await browser.pause(sec);
});

When('user kills the app', async () => {
  await browser.reset();
});

When('user insert random token', async () => {
  await browser.reset();
});

When('user select order {string}', async () => {
  const divSelector =
    '/hierarchy/android.widget.FrameLayout/android.widget.LinearLayout/android.widget.FrameLayout/android.widget.LinearLayout/android.widget.FrameLayout/android.widget.FrameLayout/android.view.ViewGroup/android.view.ViewGroup/android.view.ViewGroup/android.view.ViewGroup[1]/android.view.ViewGroup/android.view.ViewGroup/android.view.ViewGroup/android.view.ViewGroup/android.view.ViewGroup/android.view.ViewGroup/android.view.ViewGroup/android.view.ViewGroup/android.view.ViewGroup/android.view.ViewGroup[3]/android.widget.ScrollView/android.view.ViewGroup/android.view.ViewGroup';

  // Itera sobre los div dentro de .table-container
  for (let i = 1; ; i++) {
    const currentDivSelector = `${divSelector}[${i}]`;

    // Verifica si el div actual existe
    if (!(await $(currentDivSelector).isExisting())) {
      console.log(`No existe ${currentDivSelector}`);
      break; // Si no existe, termina la iteración
    }
    const Generate = `${currentDivSelector}//android.view.ViewGroup[contains(@content-desc, 'GENERADA')]`;

    // Check if both elements exist in the current div and the date is less than or equal to the current date
    if (
      //await $(commonParent).isExisting() &&
      await $(Generate).isExisting()
    ) {
      console.log(`Elementos específicos encontrados en ${currentDivSelector}`);
      // const element = FindElement(selector)
      await Gestures.checkIfDisplayedWithScrollDown(await Generate, 10);
      // Perform actions for both elements if needed
      const divResponsive = await $(currentDivSelector);
      // await divResponsive.scrollIntoView({ block: 'center', inline: 'center' });
      // await divResponsive.waitForClickable();
      await divResponsive.click();
      break;
      // Continue with your other actions if needed
    } else {
      console.log(`Elementos específicos NO encontrados en ${currentDivSelector}`);
      continue;
    }
  }
});

When('user see modal error', async () => {
  try {
    const errorModal = await FindElement('android.errorModal');

    if (await errorModal.isDisplayed()) {
      console.log(`Modal de error encontrado, intentando cerrar...`);
      const closeButton = await FindElement('android.btnOk');

      if (await closeButton.isDisplayed()) {
        await closeButton.click();
        console.log(`Botón "Entendido" presionado.`);
      } else {
        console.log(`El botón "Entendido" no está visible.`);
      }
    } else {
      console.log(`No se encontró el modal de error, continuando con el test.`);
    }
  } catch (error) {
    console.log(`Error manejando el modal de error: ${error.message}`);
  }
});

//Reintenta presionar el botón Confirmar, caso contrario copia ID y luego vuelve al menú.
When('user wait to see and try click on {string}', async (screen) => {
  const element = await FindElement(screen, { timeout: 20000 });
  await expect(element).toBeDisplayed({ timeout: 250000, message: `No se encontró el elemento ${screen} en 90s` });
  await expect(element).toBeEnabled({ timeout: 25000, message: `El elemento ${screen} no está habilitado en 25s` });

  await element.click();
});

When('user wait to see and try click on {string} with alert timeout {int} seconds', async (screen, time) => {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const element = await FindElement(screen, { timeout: 20000 });
      await expect(element).toBeDisplayed({ timeout: 250000, message: `No se encontró el elemento ${screen} en 90s` });
      await expect(element).toBeEnabled({ timeout: 25000, message: `El elemento ${screen} no está habilitado en 25s` });

      await browser.pause(500);
      await element.click();
      console.log(`Intento ${attempts + 1}: Se hizo click en ${screen}`);
      await browser.pause(5000);
      const errorModal = await FindElement('android.errorModal');
      const modalAppeared = await browser
        .waitUntil(
          async () => {
            return await errorModal.isDisplayed();
          },
          { timeout: time * 1000, interval: 500 }
        )
        .catch(() => false);

      if (modalAppeared) {
        console.log(`Modal de error detectado después del intento ${attempts + 1}, intentando cerrarlo...`);

        const closeButton = await FindElement('android.btnOk');
        if (await closeButton.isDisplayed()) {
          //Cambiar Xpath cuando Mobile actualice el path
          const xpathError =
            '/hierarchy/android.widget.FrameLayout/android.widget.LinearLayout/android.widget.FrameLayout/android.widget.LinearLayout/android.widget.FrameLayout/android.widget.FrameLayout/android.view.ViewGroup/android.view.ViewGroup/android.view.ViewGroup/android.view.ViewGroup[2]/android.view.ViewGroup/android.view.ViewGroup/android.widget.TextView[4]';
          // Se obtiene el elemento por el XPath provisto para trackear el error
          const trackingElement = await $(xpathError, 10000);
          const trackingValue = await trackingElement.getText();
          // Se agrega el step con el valor obtenido para trackear el error
          addStep(`Tracking Error ID: ${trackingValue} `, await browser.takeScreenshot());
          await closeButton.click();
          console.log(`Botón "Entendido" presionado.`);
        } else {
          console.log(`El botón "Entendido" no está visible.`);
        }

        // Volvemos a intentar presionar el botón "Confirmar"
        attempts++;
        continue;
      }
      const btnRetry = await browser
        .waitUntil(
          async () => {
            return await element.isDisplayed();
          },
          { timeout: 2000, interval: 500 }
        )
        .catch(() => false);

      if (btnRetry) {
        console.log(`Botón detectado después del intento ${attempts + 1}, intentando cerrarlo...`);

        if (await element.isDisplayed()) {
          await element.click();
          addStep(`Reintento ${attempts + 1} haciendo Click :`, await browser.takeScreenshot());
        } else {
          console.log(`El botón "Entendido" no está visible.`);
        }

        // Volvemos a intentar presionar el botón "Confirmar"
        attempts++;
        continue;
      } else {
        // Si no apareció el modal de error, salimos del loop
        console.log(`No apareció el botón de click, continuando con el test.`);
        break;
      }
    } catch (error) {
      console.log(`Error en intento ${attempts + 1}: ${error.message}`);
      attempts++;
    }
  }

  if (attempts === maxAttempts) {
    await browser.waitUntil(
      async () => {
        const menu = await $('//*[@resource-id="menu_button"]');
        if (await menu.isDisplayed()) {
          return true;
        }
        try {
          const element2 = await $('~Cerrar');
          await element2.click();
        } catch (e) {
          // ignore if close button is not found and continue polling for menu
        }
        await browser.pause(1000);
        return false;
      },
      {
        timeout: 30000,
        timeoutMsg: 'No se pudo volver al menú principal después de fallar la acción.',
      }
    );
    assert.fail(`No se pudo completar la acción en el botón ${screen} después de ${maxAttempts} intentos.`);
  }
});

When('user wait to see and try click on menu {string}', async (screen) => {
  let attempts = 0;
  const maxAttempts = 3;
  let mainElement;

  while (attempts < maxAttempts) {
    try {
      const errorModal = await FindElement('android.errorModal');
      const modalAppeared = await browser
        .waitUntil(
          async () => {
            return await errorModal.isDisplayed();
          },
          { timeout: 6000, interval: 500 }
        )
        .catch(() => false);

      if (modalAppeared) {
        console.log(`Modal de error detectado después del intento ${attempts + 1}, intentando cerrarlo...`);

        const closeButton = await FindElement('android.btnOk');
        if (await closeButton.isDisplayed()) {
          try {
            const xpathError =
              '/hierarchy/android.widget.FrameLayout/android.widget.LinearLayout/android.widget.FrameLayout/android.widget.LinearLayout/android.widget.FrameLayout/android.widget.FrameLayout/android.view.ViewGroup/android.view.ViewGroup/android.view.ViewGroup/android.view.ViewGroup[2]/android.view.ViewGroup/android.view.ViewGroup/android.widget.TextView[4]';
            const trackingElement = await $(xpathError, setDefaultTimeout(5000));
            const trackingValue = await trackingElement.getText();
            addStep(`Tracking Error ID: ${trackingValue} `, await browser.takeScreenshot());
          } catch (error) {
            console.log('no se visualizó el xpathError');
            addStep(`No se visualizó el Tracking Error ID`, await browser.takeScreenshot());
          }
          await closeButton.click();
          console.log(`Botón "Entendido" presionado.`);
        } else {
          console.log(`El botón "Entendido" no está visible.`);
        }
      }
      mainElement = await FindElement(screen, 5000); // Intentamos encontrar el elemento con un timeout corto inicialmente

      const isElementVisible = await browser.waitUntil(
        async () => {
          return await mainElement.isDisplayed();
        },
        { timeout: 10000, interval: 1000 }
      );

      if (isElementVisible) {
        await browser.pause(500);
        await mainElement.click();
        console.log(`Intento ${attempts + 1}: Se hizo click en ${screen}`);
        break; // Si el clic fue exitoso, salimos del bucle
      } else {
        console.log(`Intento ${attempts + 1}: El elemento "${screen}" no se visualizó correctamente.`);
        attempts++;
      }
    } catch (error) {
      console.log(`Error en intento ${attempts + 1}: ${error.message}`);
      console.log('Intentando hacer clic en "btnCerrar" debido a error al interactuar con el elemento...');
      try {
        const btnCerrar = await $('~Cerrar');
        if (await btnCerrar.isDisplayed()) {
          await btnCerrar.click();
          console.log('Se hizo clic en "btnCerrar".');
          attempts++;
          continue;
        } else {
          console.log('El botón "Cerrar" no se encontró.');
          const btnInicio = await $('~Volver al inicio');
          await btnInicio.click();
          console.log('Se intentó hacer click en Volver al inicio');
          attempts++;
        }
      } catch (errorCerrar) {
        console.log(`Error al intentar hacer clic en "btnCerrar": ${errorCerrar.message}`);
        attempts++;
      }
    }
  }

  if (attempts === maxAttempts) {
    await browser.waitUntil(
      async () => {
        const menu = await $('//*[@resource-id="menu_button"]');
        if (await menu.isDisplayed()) {
          return true;
        }
        try {
          const element2 = await $('~Cerrar');
          if (await element2.isDisplayed()) {
            await element2.click();
          }
        } catch (e) {
          // 'Cerrar' not found, do nothing and wait for menu
        }
        await browser.pause(1000);
        return false;
      },
      {
        timeout: 30000,
        timeoutMsg: 'No se pudo volver al menú principal después de fallar la acción.',
      }
    );
    assert.fail(`No se pudo completar la acción en el botón ${screen} después de ${maxAttempts} intentos.`);
  }
});

//No toma los path
When('user tap {string} from path {string}', async (text, path) => {
  const element = await FindElement(text);
  let requestId;
  let pathFound = false;

  // Manejar el evento 'Network.requestWillBeSent'
  browser.on('Network.requestWillBeSent', async (event) => {
    if (event.request.url.endsWith(path)) {
      requestId = event.requestId;
      console.log(`Request: ${event.request.method} ${event.request.url}`);
      console.log(`RequestId: ${requestId}`);
      addStep(`ProcessID: ${event.request.headers.process}`);
      pathFound = true;
    }
  });

  // Hacer clic en el elemento
  await (await element).click();

  // Esperar hasta que se encuentre el path o se alcance el timeout
  await browser.waitUntil(
    async () => {
      await expect(pathFound).toBe(true); // Verificar si pathFound es true
      return true; // Devolver true para salir del waitUntil
    },
    {
      timeout: 10000, // 10 segundos
      timeoutMsg: `No se encontró el path "${path}" dentro del tiempo especificado`,
      interval: 100, // Verificar cada 100 milisegundos
    }
  );

  // Manejar el evento 'Network.responseReceived'
  browser.on('Network.responseReceived', async (event) => {
    if (event.requestId === requestId) {
      console.log(`Response: ${event.response.status} ${event.response.url}`);
      const responseBody = await browser.cdp('Network', 'getResponseBody', { requestId });
      const responseBodyText = responseBody.body;
      const responseBodyJson = JSON.parse(responseBodyText);
      let transactionId;
      if (path == '/process') {
        transactionId = responseBodyJson.transaction;
      } else {
        transactionId = responseBodyJson.trxId;
      }

      console.log(`Transaction ID: ${transactionId}`);
      addStep(`URL: ${event.response.url} \n Body Response: ${JSON.stringify(responseBody)}`);
      addStep(`Transaction ID: ${transactionId}`);
    }
  });
});

When('user wait to see {string} and get response', async (text) => {
  //const element = await FindElement(text);

  let requestId;

  const element = await FindElement(text);
  await expect(element).toBeDisplayed({ timeout: 60000, message: `No se encontró el elemento ${element} en 60s` });

  // Manejar el evento 'Network.responseReceived'
  browser.on('Network.responseReceived', async (event) => {
    if (event.requestId === requestId) {
      console.log(`Response: ${event.response.status} ${event.response.url}`);
      const responseBody = await browser.cdp('Network', 'getResponseBody', { requestId });

      addStep(`URL: ${event.response.url} \n Body Response: ${JSON.stringify(responseBody)}`);
    }
  });
});

When('user returns to home and waits', async function () {
  const homeScreenIdentifier = 'homePageSimple.btnMenu';
  const backButtonIdentifiers = [
    'btnBackHome', // Tu botón específico "Volver al inicio" (ej: "~Volver al inicio")
    '~Cerrar', // Un botón de cierre genérico (ej: ID de accesibilidad)
    // Añade más identificadores de botones de retroceso si es necesario, en orden de prioridad
  ];

  let attempts = 0;
  const maxAttempts = 5;
  let onHomeScreen = false;

  await addStep('Intentando regresar a la pantalla de inicio y esperar...', await browser.takeScreenshot());

  while (attempts < maxAttempts && !onHomeScreen) {
    attempts++;
    await addStep(
      `Intento de navegación ${attempts}/${maxAttempts} para llegar al Home.`,
      await browser.takeScreenshot()
    );

    try {
      const homeElement = await FindElement(homeScreenIdentifier, { timeout: 2000 });
      if (await homeElement.isDisplayed()) {
        onHomeScreen = true;
        await addStep(`Elemento del Home ("${homeScreenIdentifier}") encontrado.`, await browser.takeScreenshot());
        break;
      }
    } catch (e) {
      console.log('error', e);
    }

    if (onHomeScreen) break;

    let specificButtonActionTaken = false;
    for (const buttonKey of backButtonIdentifiers) {
      try {
        const backButton = await FindElement(buttonKey, { timeout: 1000 });
        if ((await backButton.isDisplayed()) && (await backButton.isEnabled())) {
          await addStep(`Intentando clic en botón de retroceso: "${buttonKey}"`, await browser.takeScreenshot());
          await backButton.click();
          specificButtonActionTaken = true;
          break;
        }
      } catch (e) {
        console.log('error', e);
      }
    }

    let browserBackActionTaken = false;
    if (!specificButtonActionTaken) {
      try {
        await addStep(
          'Ningún botón de retroceso específico funcionó/encontró. Intentando acción "Atrás" del sistema.',
          await browser.takeScreenshot()
        );
        await browser.back();
        browserBackActionTaken = true;
      } catch (e) {
        await addStep('Acción "Atrás" del sistema falló.', await browser.takeScreenshot());
      }
    }

    if (specificButtonActionTaken || browserBackActionTaken) {
      await browser.pause(2000);
    } else if (attempts > 1) {
      // Solo loguear si no es el primer intento y no se pudo hacer nada
      await addStep('Ninguna acción de retroceso pudo ser realizada en este intento.', await browser.takeScreenshot());
    }
  }

  if (onHomeScreen) {
    await addStep(
      `Éxito: En pantalla de Home. Verificando elemento "${homeScreenIdentifier}".`,
      await browser.takeScreenshot()
    );
    try {
      const homeElementFinal = await FindElement(homeScreenIdentifier, { timeout: 20000 });
      await expect(homeElementFinal).toBeDisplayed({
        timeout: 25000,
        message: `Elemento del Home "${homeScreenIdentifier}" NO se mostró después de la navegación.`,
      });
      await expect(homeElementFinal).toBeEnabled({
        timeout: 25000,
        message: `Elemento del Home "${homeScreenIdentifier}" NO está habilitado después de la navegación.`,
      });
      await addStep('Verificación del Home completada. Esperando brevemente.', await browser.takeScreenshot());
      await browser.pause(1000);
    } catch (error) {
      const errorMessage = `Error en Home: Aunque se detectó la pantalla, la verificación final del elemento "${homeScreenIdentifier}" falló: ${error.message}`;
      await addStep(errorMessage, await browser.takeScreenshot());
      throw new Error(errorMessage);
    }
  } else {
    const failMessage = `Fallo: No se pudo regresar a la pantalla de inicio y encontrar "${homeScreenIdentifier}" después de ${maxAttempts} intentos.`;
    await addStep(failMessage, await browser.takeScreenshot());
    throw new Error(failMessage);
  }
});

When('user wait to see and try click on feature {string}', async (screen) => {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const element = await FindElement(screen, { timeout: 20000 });
      await expect(element).toBeDisplayed({ timeout: 250000, message: `No se encontró el elemento ${screen} en 90s` });
      await expect(element).toBeEnabled({ timeout: 25000, message: `El elemento ${screen} no está habilitado en 25s` });

      await browser.pause(500);
      await element.click();
      console.log(`Intento ${attempts + 1}: Se hizo click en ${screen}`);
      await browser.pause(5000);
      const errorModal = await FindElement('android.errorModal');
      const modalAppeared = await browser
        .waitUntil(
          async () => {
            return await errorModal.isDisplayed();
          },
          { timeout: 10000, interval: 500 }
        )
        .catch(() => false);

      if (modalAppeared) {
        console.log(`Modal de error detectado después del intento ${attempts + 1}, intentando cerrarlo...`);

        const closeButton = await FindElement('android.btnOk');
        if (await closeButton.isDisplayed()) {
          const xpathError =
            '/hierarchy/android.widget.FrameLayout/android.widget.LinearLayout/android.widget.FrameLayout/android.widget.LinearLayout/android.widget.FrameLayout/android.widget.FrameLayout/android.view.ViewGroup/android.view.ViewGroup/android.view.ViewGroup/android.view.ViewGroup[2]/android.view.ViewGroup/android.view.ViewGroup/android.widget.TextView[4]';
          const trackingElement = await $(xpathError, 10000);
          const trackingValue = await trackingElement.getText();
          addStep(`Tracking Error ID: ${trackingValue} `, await browser.takeScreenshot());
          await closeButton.click();
          console.log(`Botón "Entendido" presionado.`);
          const btnRetry = await browser
            .waitUntil(
              async () => {
                console.log(`aparece botón nuevamente?`);
                return await $(element).isDisplayed();
              },
              { timeout: 2000, interval: 500 }
            )
            .catch(() => false);

          if (btnRetry) {
            console.log(`Botón detectado después del intento ${attempts + 1}, intentando cerrarlo...`);

            if (await element.isDisplayed()) {
              await element.click();
              addStep(`Reintento ${attempts + 1} haciendo Click :`, await browser.takeScreenshot());
            } else {
              console.log(`El botón no está visible`);
              break;
            }
          } else {
            console.log(`El botón de Click no está visible.`);
            break;
          }
        }
        // Volvemos a intentar presionar el botón "Confirmar"
        attempts++;
        continue;
      } else {
        // Si no apareció el modal de error, salimos del loop
        console.log(`No apareció el botón de click, continuando con el test.`);
        break;
      }
    } catch (error) {
      console.log(`Error en intento ${attempts + 1}: ${error.message}`);
      attempts++;
    }
  }

  if (attempts === maxAttempts) {
    await browser.waitUntil(
      async () => {
        const menu = await $('//*[@resource-id="menu_button"]');
        if (await menu.isDisplayed()) {
          return true;
        }
        try {
          const element2 = await $('~Cerrar');
          await element2.click();
        } catch (e) {
          // ignore if close button is not found and continue polling for menu
        }
        await browser.pause(1000);
        return false;
      },
      {
        timeout: 30000,
        timeoutMsg: 'No se pudo volver al menú principal después de fallar la acción.',
      }
    );
    assert.fail(`No se pudo completar la acción en el botón ${screen} después de ${maxAttempts} intentos.`);
  }
});

When('user extract value from {string}', async (screen) => {
  const element = await FindElement(screen);
  await expect(element).toBeDisplayed({
    wait: 60000,
    message: 'No se encontro el elemento o texto user wait to see and click on : ' + element + ' en 90s',
  });
  const data = await $(element).getText();
  console.log('data impresa:', data);
  addStep(`Valor Extráido: ${data}`);
});
