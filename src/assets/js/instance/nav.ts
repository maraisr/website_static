import Tracking from './tracking';

interface AppElement extends Element {
	hash?: string;
}

export default function(selectors: NodeList) {
	Array.from(selectors).map(
		(v: AppElement) =>
			document.getElementById(`content-${v.hash.replace(/^#/, '')}`)
				? v.addEventListener('click', (e: MouseEvent) => {
						e.preventDefault();

						let clickTo: string = (<AppElement>e.target).hash.replace(
							/^#/,
							''
						);

						(function scroll(to: number, duration: number) {
							if (duration <= 0) return;
							let dif = to - document.body.scrollTop;
							let perTick = dif / duration * 10;

							setTimeout(() => {
								document.body.scrollTop += perTick;
								if (document.body.scrollTop === to) return;
								scroll(to, duration - 10);
							}, 10);
						})(
							document.getElementById(`content-${clickTo}`)
								.offsetTop,
							600
						);

						Tracking.track('Nav', 'click', clickTo);

						return false;
				  })
				: void 0
	);
}
