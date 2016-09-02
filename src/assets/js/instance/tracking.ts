declare var ga: any;

export default class Tracking implements TrackingInterface {
	constructor() {
		ga('create', 'UA-47550066-2', 'auto');
		ga('send', 'pageview');

		// Mailto links
		[...document.querySelectorAll('[href^="mailto"]')].forEach((node: Element) => {
			node.addEventListener('click', (e: MouseEvent) => this.track('Nav', 'click', 'mailto'));
		});

		[... document.getElementsByClassName('social')].forEach((node: Element) => {
			[...node.getElementsByTagName('a')].forEach((a: Element) => {
				let title = a.getElementsByTagName('title')[0].textContent;

				a.addEventListener('click', (e: MouseEvent) => {
					this.track('Social', 'click', title);
				});
			})
		});
	}

	track(label, event, data) {
		ga('send', 'event', label, event, data);
	}
}
