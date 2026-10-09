#!/usr/bin/perl
# Prüft die Übersetzungssätze in data/grammatik.json Wort für Wort gegen die
# Originaltexte von The Latin Library (Längen, j/v, Satzzeichen und Herausgeber-
# Klammern [ … ] werden ignoriert). „original“ muss als Ganzes vorkommen,
# „gekürzt“/„angepasst“ Teilstück für Teilstück.
#
# Aufruf: perl tools/verify_quellen.pl .cache/texte
# Texte vorher laden, z. B.: curl -s https://www.thelatinlibrary.com/caesar/gall1.shtml -o .cache/texte/gall1.html
# Neue Autoren/Werke: in %files eintragen.
use strict; use warnings; use utf8; use JSON::PP; use Unicode::Normalize qw(NFD);
binmode STDOUT, ':utf8';
my $T = shift;                     # Ordner mit Texten
my %files = ('Caesar|De bello Gallico' => sub { "$T/gall$_[0].html" });
sub norm { my $s = NFD(shift); $s =~ s/\p{Mn}//g; $s = lc $s; $s =~ s/&\w+;/ /g; $s =~ tr/jv/iu/; $s =~ s/[^a-z ]+/ /g; $s =~ s/\s+/ /g; $s =~ s/^ | $//g; return " $s " }
my %cache;
sub src { my $f = shift; return $cache{$f} //= do { open my $fh, '<:encoding(latin1)', $f or die "$f: $!"; local $/; my $t = <$fh>; $t =~ s/<[^>]+>/ /g; $t =~ s/\[[^\]]{1,40}\]/ /g; norm($t) } }
open my $j, '<:raw', 'data/grammatik.json' or die; my $d = do { local $/; decode_json(<$j>) };
my $bad = 0;
for my $u (@{ $d->{einheiten} }) {
  for my $a (grep { $_->{typ} eq 'uebersetzung' && $_->{bearbeitung} ne 'konstruiert' } @{ $u->{aufgaben} }) {
    my $q = $a->{quelle};
    my $mk = $files{"$q->{autor}|$q->{werk}"} or do { print "$u->{id} $q->{autor} $q->{stelle}: keine Textdatei hinterlegt\n"; next };
    my ($book) = $q->{stelle} =~ /^(\d+)/;
    my $s = src($mk->($book));
    my $whole = index($s, norm(join ' ', map { $_->{latein} } @{ $a->{teile} })) >= 0;
    my @miss = grep { index($s, norm($_->{latein})) < 0 } @{ $a->{teile} };
    $bad++ if @miss || ($a->{bearbeitung} eq 'original' && !$whole);
    printf "%-10s %-9s %-10s %s\n", $u->{id}, $q->{stelle}, $a->{bearbeitung},
      $whole ? 'ganzer Satz wörtlich gefunden' : @miss ? 'FEHLT: ' . join(' | ', map { $_->{latein} } @miss) : 'alle Teilstücke wörtlich gefunden';
  }
}
print $bad ? "$bad Probleme\n" : "Alles geprüft – keine Abweichung.\n";
